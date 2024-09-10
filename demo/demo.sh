#!/bin/zsh
set -exo pipefail

cleanup() {
  # kill all processes whose parent is this process
  pkill -P $$
}

# kill all child background processes on exit
for sig in INT QUIT HUP TERM; do
  trap "
    cleanup
    trap - $sig EXIT
    kill -s $sig "'"$$"' "$sig"
done
trap cleanup EXIT

(
  mkdir -p ./bin
  cd ./bin

  eval "$(go env | grep -E '^GO(OS|ARCH)=')"

  [ ! -f ./minio ] && curl -LO "https://dl.min.io/server/minio/release/${GOOS}-${GOARCH}/minio"
  chmod +x ./minio

  [ ! -f ./gitea ] && curl -Lo gitea "https://dl.gitea.com/gitea/1.22.1/gitea-1.22.1-${GOOS}-10.12-${GOARCH}"
  chmod +x ./gitea

  if [ ! -f ./atlantis ]; then
    curl -LO "https://github.com/runatlantis/atlantis/releases/download/v0.29.0/atlantis_${GOOS}_${GOARCH}.zip"
    unzip "atlantis_${GOOS}_${GOARCH}.zip"
    rm "atlantis_${GOOS}_${GOARCH}.zip"
  fi

  go build -o . ../../
)

rm -rf ./data

./bin/minio server ./data/minio &

mkdir -p ./data/gitea/{custom,data,log}
GITEA_WORK_DIR=$PWD/data/gitea/ ./bin/gitea -c gitea.ini web &

sleep 3
./bin/gitea -c gitea.ini admin user create \
  --username test --password pass --email test@localhost --admin

TOKEN=$(./bin/gitea -c gitea.ini admin user generate-access-token \
  --username test --scopes write:repository,write:user,write:issue | \
  grep 'successfully created' | cut -d':' -f2 | tr -d ' ')
echo "TOKEN=$TOKEN"

curl --json '{"name":"atlantis-plan-ui-demo"}' "http://user:$TOKEN@localhost:3000/api/v1/user/repos"

export AWS_ACCESS_KEY_ID=minioadmin AWS_SECRET_ACCESS_KEY=minioadmin
export AWS_ENDPOINT_URL=http://localhost:9000
aws s3 mb s3://tfstate

curl --json '{
  "type": "gitea",
  "active": true,
  "branch_filter": "*",
  "events": ["push", "issue_comment", "pull_request"],
  "config": {
    "url": "http://localhost:4141/events",
    "content_type": "json",
    "http_method": "POST",
    "secret": "foobar"
  }
}' "http://user:$TOKEN@localhost:3000/api/v1/repos/test/atlantis-plan-ui-demo/hooks"

export ATLANTIS_DATA_DIR=$PWD/data/atlantis
export ATLANTIS_GITEA_TOKEN=$TOKEN
export ATLANTIS_GITEA_WEBHOOK_SECRET=foobar
./bin/atlantis server --config ./atlantis.yaml &

./bin/atlantis-plan-ui -serve :8080 -output-dir ./data/atlantis/plans-out &

(
  cd stacks
  ./gen_states.sh
  for folder in $(find . -type d -depth 1); do
    # TODO: parallel
    terraform -chdir="$folder" init
    terraform -chdir="$folder" apply -auto-approve
    # fix some weird drift from aws s3 provider
    terraform -chdir="$folder" apply -auto-approve -refresh-only
  done
)

git clone "http://test:$TOKEN@0.0.0.0:3000/test/atlantis-plan-ui-demo.git" data/repo
(
  cd data/repo
  cp -av ../../stacks/* .
  git add .
  git commit -m "Initial commit"
  git push origin main

  git checkout -b feature/lock-stack
  echo >> stack_locked/main.tf
  git add .
  git commit -m "Lock stack_locked"
  git push --set-upstream origin feature/lock-stack

  # introduce drift
  aws s3api put-object-tagging --bucket tfstate --key stack_drift/drifting --tagging 'TagSet=[{Key=test,Value=manual_value}]'

  git checkout main
  git checkout -b feature/plan
  for f in */main.tf; do
    echo >> "$f"
  done
  cp -av ../../stacks-patch/* .
  git add .
  git commit -m "Apply some changes"
  git push --set-upstream origin feature/plan
)

sleep 2

curl --json '{
  "base": "main",
  "head": "feature/lock-stack",
  "title": "Lock stack_locked"
}' "http://user:$TOKEN@localhost:3000/api/v1/repos/test/atlantis-plan-ui-demo/pulls"
sleep 1

curl --json '{
  "base": "main",
  "head": "feature/plan",
  "title": "Test PR"
}' "http://user:$TOKEN@localhost:3000/api/v1/repos/test/atlantis-plan-ui-demo/pulls"
sleep 10

open http://localhost:3000/test/atlantis-plan-ui-demo/pulls/2 || true

sleep 100000
