ARG ALPINE_VERSION=3.20

FROM alpine:${ALPINE_VERSION}
COPY atlantis-plan-ui /usr/bin/
ENTRYPOINT ["/usr/bin/atlantis-plan-ui"]
