package main

import (
	"bytes"
	"crypto/md5"
	"encoding/json"
	"flag"
	"fmt"
	"golang.org/x/net/html"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"slices"
	"strings"
	"text/template"

	"github.com/runatlantis/atlantis/server/events/models"
	"go.etcd.io/bbolt"
)

var (
	vcsRepo = flag.String("vcs-repo", "", "Repository name in the VCS")
	vcsPull = flag.Int("vcs-pull", 0, "Pull request number in the VCS")

	plansDir  = flag.String("plans-dir", "", "Directory containing processed source plan files")
	outputDir = flag.String("output-dir", "", "Output directory for the generated JSON files")

	postComment = flag.Bool("post-comment", true, "Post comment to the VCS with link to the generated UI")
	uiURL       = flag.String("plan-ui-url", "", "URL of the atlantis-plan-ui server")

	serve = flag.String("serve", "", "Serve UI (frontend and JSONs) on the specified address, disable by default")
)

func run() error {
	if *vcsRepo == "" || *vcsPull == 0 {
		flag.Usage()
		return fmt.Errorf("no -vcs-repo or -vcs-pull specified")
	}

	if *plansDir == "" || *outputDir == "" {
		flag.Usage()
		return fmt.Errorf("no -plans-dir or -output-dir specified")
	}

	if *postComment && *uiURL == "" {
		flag.Usage()
		return fmt.Errorf("no -plan-ui-url specified, consider using -post-comment=false")
	}

	if err := os.MkdirAll(*outputDir, 0755); err != nil {
		return err
	}

	flags, err := getAtlantisFlags()
	if err != nil {
		return fmt.Errorf("failed to get Atlantis flags: %w", err)
	}
	log.Printf("got Atlantis flags: %+v", flags)

	var commenter *commentPoster
	if *postComment {
		commenter, err = getCommentPoster()
		if err != nil {
			return fmt.Errorf("failed to get comment poster: %w", err)
		}
		log.Println("got comment poster")
	}

	db, err := getAtlantisDB(flags.AtlantisDB)
	if err != nil {
		return fmt.Errorf("failed to open Atlantis DB: %w", err)
	}
	defer db.Close()
	log.Println("opened Atlantis DB")

	pull, err := getPull(db, *vcsRepo, *vcsPull)
	if err != nil {
		return fmt.Errorf("failed to get pull info: %w", err)
	}
	log.Printf("got pull info: %s#%d", pull.Pull.BaseRepo.FullName, pull.Pull.Num)

	data, err := convertPull(db, flags, pull)
	if err != nil {
		return fmt.Errorf("failed to convert pull to UI: %w", err)
	}
	log.Println("converted pull to UI")

	hash, err := writeUIData(data)
	if err != nil {
		return fmt.Errorf("failed to write UI data: %w", err)
	}
	log.Printf("wrote UI data")

	if !*postComment {
		log.Println("skipping comment posting as requested")
		return nil
	}

	comment, err := renderComment(data, hash)
	if err != nil {
		return fmt.Errorf("failed to render comment: %w", err)
	}

	if err := commenter.postComment(pull.Pull.BaseRepo, pull.Pull.Num, comment); err != nil {
		return fmt.Errorf("failed to post comment: %w", err)
	}
	log.Printf("posted comment")
	return nil
}

func getAtlantisDB(dbPath string) (*bbolt.DB, error) {
	dbData, err := os.Open(dbPath)
	if err != nil {
		return nil, err
	}

	// This is a hack to avoid flocking the db file. Atlantis takes exclusive lock, and bbolt can't ignore locks.
	dbCopy, err := os.CreateTemp("", "atlantis.db")
	if err != nil {
		return nil, err
	}
	// safe to remove, db will be kept open by bbolt
	defer os.Remove(dbCopy.Name())

	if _, err := io.Copy(dbCopy, dbData); err != nil {
		return nil, err
	}

	db, err := bbolt.Open(dbCopy.Name(), 0600, &bbolt.Options{ReadOnly: true})
	if err != nil {
		return nil, err
	}
	return db, nil
}

func getPull(db *bbolt.DB, repo string, num int) (models.PullStatus, error) {
	var pull models.PullStatus
	err := db.View(func(tx *bbolt.Tx) error {
		pullSuffix := fmt.Sprintf("::%s::%d", repo, num)
		var pullVal []byte
		if err := tx.Bucket([]byte("pulls")).ForEach(func(k, v []byte) error {
			// easier to look up by suffix than to specify the full key with vcsHost
			if strings.HasSuffix(string(k), pullSuffix) {
				pullVal = v
			}
			return nil
		}); err != nil {
			return err
		}
		if pullVal == nil {
			return fmt.Errorf("pull %s#%d not found", repo, num)
		}
		return json.Unmarshal(pullVal, &pull)
	})
	return pull, err
}

func convertPull(db *bbolt.DB, flags *atlantisFlags, pull models.PullStatus) (uiData, error) {
	res := uiData{
		ExecutableName: flags.ExecutableName,
		PRRepo:         pull.Pull.BaseRepo.FullName,
		PRNum:          pull.Pull.Num,
		PRURL:          pull.Pull.URL,
	}

	locks, err := getLocks(db)
	if err != nil {
		return uiData{}, err
	}
	log.Println("got locks")

	logURLs, err := getLogURLs(flags.AtlantisURL)
	if err != nil {
		return uiData{}, err
	}

	for _, prj := range pull.Projects {
		uiPrj, err := convertStack(pull, prj, locks, logURLs, flags.AtlantisURL)
		if err != nil {
			return uiData{}, err
		}
		res.Stacks = append(res.Stacks, uiPrj)
	}
	return res, nil
}

func convertStack(pull models.PullStatus, prj models.ProjectStatus, locks map[string]*models.ProjectLock, logURLs map[string]string, atlantisURL string) (uiStack, error) {
	uiPrj := uiStack{
		Name:   prj.ProjectName,
		Path:   prj.RepoRelDir,
		LogURL: logURLs[formatProjectLogKey(pull.Pull, prj)],
	}

	// this includes plan errors and locked projects
	if prj.Status == models.ErroredPlanStatus {
		uiPrj.PlanError = true

		lockID := fmt.Sprintf("%s/%s/%s", pull.Pull.BaseRepo.FullName, prj.RepoRelDir, prj.Workspace)
		if lock := locks[lockID]; lock != nil {
			// this check should be redundant, but just in case
			if lock.Pull.BaseRepo.FullName != pull.Pull.BaseRepo.FullName || lock.Pull.Num != pull.Pull.Num {
				uiPrj.LockURL = atlantisURL + "/lock?id=" + url.QueryEscape(lockID)
				uiPrj.LockPRURL = lock.Pull.URL
				uiPrj.LockPRAuthor = lock.Pull.Author
			}
		}

		return uiPrj, nil
	}

	if prj.Status != models.PlannedPlanStatus && prj.Status != models.PlannedNoChangesPlanStatus {
		log.Printf("got unexpected status for project %s: %s, grabbing latest plan anyway", prj.ProjectName, prj.Status)
	}

	planDir := fmt.Sprintf("%s/%s/%d/%s/", *plansDir, *vcsRepo, *vcsPull, prj.RepoRelDir)
	tfp, err := parseJSONPlan(planDir + "plan.json")
	if err != nil {
		return uiStack{}, err
	}

	txts, err := parseTextPlan(planDir + "plan.txt")
	if err != nil {
		return uiStack{}, err
	}

	uiPrj.uiProjectDiffs = convertStackPlan(tfp, txts)

	return uiPrj, nil
}

func convertStackPlan(tf *tfPlan, txt *textualValues) uiProjectDiffs {
	res := uiProjectDiffs{}

	const defaultDiff = "No textual diff available, please file an issue. You can check full stack log in the meantime."
	changedAddrs := make(map[string]bool)

	for _, resCh := range tf.ResourceChanges {
		if resCh.Mode != "managed" {
			continue
		}

		if resCh.PreviousAddress != "" {
			res.Moves = append(res.Moves, uiDiff{
				Address:         resCh.Address,
				PreviousAddress: resCh.PreviousAddress,
			})
		}

		ch := resCh.Change
		if !slices.Equal(ch.Actions, []string{"no-op"}) {
			changedAddrs[resCh.Address] = true

			diff := txt.diffs[resCh.Address]
			if diff == "" {
				diff = defaultDiff
			}

			res.ResourceDiffs = append(res.ResourceDiffs, uiDiff{
				Address: resCh.Address,
				Actions: ch.Actions,
				Diff:    txt.diffs[resCh.Address],
			})
		}

		if ch.Importing != nil {
			id := ch.Importing.ID
			if ch.Importing.Unknown {
				id = "(unknown)"
			}
			res.Imports = append(res.Imports, uiDiff{
				Address:  resCh.Address,
				ImportID: id,
			})
		}
	}

	for _, resDr := range tf.ResourceDrift {
		if !changedAddrs[resDr.Address] {
			// replicate terraform behaviour: don't show drifts for non-modified objs
			continue
		}

		diff := txt.drifts[resDr.Address]
		if diff == "" {
			diff = "No textual diff available for this drift. Most likely terraform did not include it in the plan."
		}

		res.DriftDiffs = append(res.DriftDiffs, uiDiff{
			Address: resDr.Address,
			Diff:    diff,
		})
	}

	for outName, outCh := range tf.OutputChanges {
		if slices.Equal(outCh.Actions, []string{"no-op"}) {
			continue
		}

		diff := txt.outputs[outName]
		if diff == "" {
			diff = defaultDiff
		}

		res.OutputDiffs = append(res.OutputDiffs, uiDiff{
			Address: outName,
			Diff:    diff,
		})
	}

	return res
}

func getLocks(db *bbolt.DB) (map[string]*models.ProjectLock, error) {
	locks := map[string]*models.ProjectLock{}
	err := db.View(func(tx *bbolt.Tx) error {
		return tx.Bucket([]byte("runLocks")).ForEach(func(k, v []byte) error {
			var lock models.ProjectLock
			if err := json.Unmarshal(v, &lock); err != nil {
				return err
			}
			locks[string(k)] = &lock
			return nil
		})
	})
	return locks, err
}

func getLogURLs(atlantisURL string) (map[string]string, error) {
	r, err := http.Get(atlantisURL)
	if err != nil {
		return nil, err
	}
	defer r.Body.Close()

	doc, err := html.Parse(r.Body)
	if err != nil {
		return nil, err
	}

	res := make(map[string]string)

	var crawler func(*html.Node)
	crawler = func(node *html.Node) {
		if node.Type == html.ElementNode && node.Data == "div" {
			if slices.ContainsFunc(node.Attr, func(a html.Attribute) bool {
				return a.Key == "class" && a.Val == "pulls-row"
			}) {
				k, v := parseAtlantisJobHTML(node)
				if v != "" {
					res[k] = atlantisURL + v
				}
			}
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			crawler(child)
		}
	}
	crawler(doc)

	return res, nil
}

// parseAtlantisJobHTML parses the HTML of the Atlantis job page and returns the project id and the plan URL.
func parseAtlantisJobHTML(node *html.Node) (string, string) {
	cur := node.FirstChild.NextSibling
	prNum := cur.FirstChild.Data

	cur = cur.NextSibling.NextSibling
	if cur.FirstChild == nil {
		// pre/post workflow hooks
		return "", ""
	}
	prjName := cur.FirstChild.FirstChild.Data

	cur = cur.NextSibling.NextSibling
	workspaceName := cur.FirstChild.FirstChild.Data

	cur = cur.NextSibling.NextSibling
	// skip time column

	cur = cur.NextSibling.NextSibling
	a := cur.FirstChild.NextSibling.FirstChild
	link := a.Attr[0].Val

	return fmt.Sprintf("%s %s %s", prNum, prjName, workspaceName), link
}

func formatProjectLogKey(pull models.PullRequest, prj models.ProjectStatus) string {
	return fmt.Sprintf("%s #%d %s %s", pull.BaseRepo.FullName, pull.Num, prj.RepoRelDir, prj.Workspace)
}

func writeUIData(res uiData) (string, error) {
	jsonData, err := json.Marshal(res)
	if err != nil {
		return "", err
	}

	hasher := md5.New()
	hasher.Write(jsonData)
	hash := fmt.Sprintf("%x", hasher.Sum(nil))

	if err := os.WriteFile(fmt.Sprintf("%s/%d.json", *outputDir, *vcsPull), jsonData, 0644); err != nil {
		return "", err
	}
	if err := os.WriteFile(fmt.Sprintf("%s/%d_%s.json", *outputDir, *vcsPull, hash), jsonData, 0644); err != nil {
		return "", err
	}
	return hash, nil
}

func renderComment(data uiData, hash string) (string, error) {
	t := template.Must(template.New("comment").Parse(`
## [↗️ Plans viewer]({{ .URL }})

<sup>[permalink]({{ .PermanentURL }})</sup>

* Total stacks: **{{ .TotalStacks }}**
{{ if gt .StacksErrored 0 -}}
* ⚠️ With plan errors: **{{ .StacksErrored }}**
{{ end -}}
{{ if gt .StacksLocked 0 -}}
* ⌛️ Locked: **{{ .StacksLocked }}**
{{ end -}}
{{ if gt .StacksWithRsrcChanges 0 -}}
* 📋 With resource changes: **{{ .StacksWithRsrcChanges }}** (
{{- if gt .StacksWithCreates 0 }}🟢 **{{ .StacksWithCreates }}** w/creates; {{ end -}}
{{- if gt .StacksWithUpdates 0 }}🟡 **{{ .StacksWithUpdates }}** w/updates; {{ end -}}
{{- if gt .StacksWithDeletes 0 }}🔴 **{{ .StacksWithDeletes }}** w/deletes{{ end -}}
)
{{ end -}}
{{ if gt .StacksWithZeroDiff 0 -}}
* 0️⃣ Without resource changes: **{{ .StacksWithZeroDiff }}**
{{ end -}}
{{ if gt .StacksWithOutputChanges 0 -}}
* ⤴️ With output changes: **{{ .StacksWithOutputChanges }}**
{{ end -}}
{{ if gt .StacksWithDrifts 0 -}}
* ↙️ With drifts: **{{ .StacksWithDrifts }}**
{{ end -}}
{{ if gt .StacksWithImports 0 -}}
* ⤵️ With imports: **{{ .StacksWithImports }}**
{{ end -}}
{{ if gt .StacksWithMoves 0 -}}
* 🔁 With moves: **{{ .StacksWithMoves }}**
{{ end -}}
`))

	var templateData = struct {
		URL                     string
		PermanentURL            string
		TotalStacks             int
		StacksErrored           int
		StacksLocked            int
		StacksWithRsrcChanges   int
		StacksWithCreates       int
		StacksWithUpdates       int
		StacksWithDeletes       int
		StacksWithZeroDiff      int
		StacksWithOutputChanges int
		StacksWithDrifts        int
		StacksWithImports       int
		StacksWithMoves         int
	}{
		URL:          fmt.Sprint(*uiURL, "#", *vcsPull),
		PermanentURL: fmt.Sprint(*uiURL, "#", *vcsPull, "_", hash),
		TotalStacks:  len(data.Stacks),
	}

	for _, stack := range data.Stacks {
		if stack.LockURL != "" {
			templateData.StacksLocked++
			continue
		}
		if stack.PlanError {
			templateData.StacksErrored++
			continue
		}

		if len(stack.ResourceDiffs) > 0 {
			templateData.StacksWithRsrcChanges++
			if slices.ContainsFunc(stack.ResourceDiffs, func(d uiDiff) bool {
				return slices.Contains(d.Actions, "create")
			}) {
				templateData.StacksWithCreates++
			}

			if slices.ContainsFunc(stack.ResourceDiffs, func(d uiDiff) bool {
				return slices.Contains(d.Actions, "update")
			}) {
				templateData.StacksWithUpdates++
			}

			if slices.ContainsFunc(stack.ResourceDiffs, func(d uiDiff) bool {
				return slices.Contains(d.Actions, "delete")
			}) {
				templateData.StacksWithDeletes++
			}
		} else {
			templateData.StacksWithZeroDiff++
		}
		if len(stack.OutputDiffs) > 0 {
			templateData.StacksWithOutputChanges++
		}
		if len(stack.DriftDiffs) > 0 {
			templateData.StacksWithDrifts++
		}
		if len(stack.Imports) > 0 {
			templateData.StacksWithImports++
		}
		if len(stack.Moves) > 0 {
			templateData.StacksWithMoves++
		}
	}

	var buf bytes.Buffer
	if err := t.Execute(&buf, templateData); err != nil {
		return "", fmt.Errorf("failed to render comment: %w", err)
	}
	comment := buf.String()
	return comment, nil
}

type uiData struct {
	ExecutableName string `json:"executable_name"`

	PRRepo string `json:"pr_repo"`
	PRNum  int    `json:"pr_num"`
	PRURL  string `json:"pr_url"`

	Stacks []uiStack `json:"stacks"`
}

type uiStack struct {
	Name string `json:"name"`
	Path string `json:"path"`

	PlanError bool   `json:"plan_error"`
	LogURL    string `json:"log_url"`

	LockURL      string `json:"lock_url,omitempty"`
	LockPRURL    string `json:"lock_pr_url,omitempty"`
	LockPRAuthor string `json:"lock_pr_author,omitempty"`

	uiProjectDiffs
}

type uiProjectDiffs struct {
	ResourceDiffs []uiDiff `json:"resource_diffs,omitempty"`
	OutputDiffs   []uiDiff `json:"output_diffs,omitempty"`
	DriftDiffs    []uiDiff `json:"drift_diffs,omitempty"`
	Moves         []uiDiff `json:"moves,omitempty"`
	Imports       []uiDiff `json:"imports,omitempty"`
	Deletes       []uiDiff `json:"deletes,omitempty"`
}

type uiDiff struct {
	// Address is set for all usages, address of the resource or name of the output
	Address string `json:"address"`

	// Actions is set only for resource diffs
	Actions []string `json:"actions,omitempty"`

	// Diff is set resource, output, and drift diffs and is a textual diff
	Diff string `json:"diff,omitempty"`

	// PreviousAddress is set for moves (and all other fields are empty), otherwise empty
	PreviousAddress string `json:"previous_address,omitempty"`

	// ImportID is set for imports (and all other fields are empty), otherwise empty
	ImportID string `json:"import_id,omitempty"`
}

func main() {
	flag.Parse()

	if *serve != "" {
		if err := runServe(*serve); err != nil {
			panic(err)
		}
	}

	if err := run(); err != nil {
		panic(err)
	}
}
