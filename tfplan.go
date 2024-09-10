package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"regexp"
	"strings"
	"unicode"
)

type tfPlan struct {
	FormatVersion   string              `json:"format_version"`
	ResourceDrift   []tfResourceChange  `json:"resource_drift"`
	ResourceChanges []tfResourceChange  `json:"resource_changes"`
	OutputChanges   map[string]tfChange `json:"output_changes"`
	Timestamp       string              `json:"timestamp"`
}

type tfResourceChange struct {
	Address         string   `json:"address"`
	PreviousAddress string   `json:"previous_address"`
	Mode            string   `json:"mode"`
	Change          tfChange `json:"change"`
}

type tfChange struct {
	// Valid actions values are:
	//    ["no-op"]
	//    ["create"]
	//    ["read"]
	//    ["update"]
	//    ["delete", "create"] (replace)
	//    ["create", "delete"] (replace)
	//    ["delete"]
	//    ["forget"]
	//    ["create", "forget"] (replace)
	Actions []string `json:"actions"`

	Importing *struct {
		ID      string `json:"id"`
		Unknown bool   `json:"unknown"`
	} `json:"importing"`
}

func parseJSONPlan(fname string) (*tfPlan, error) {
	f, err := os.Open(fname)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var res tfPlan
	if err := json.NewDecoder(f).Decode(&res); err != nil {
		return nil, err
	}

	if res.FormatVersion[:2] != "1." {
		return nil, fmt.Errorf("unsupported format version: %s", res.FormatVersion)
	}

	return &res, nil
}

type textualValues struct {
	diffs   map[string]string
	drifts  map[string]string
	outputs map[string]string
}

// parseTextPlan parses the output of a terraform show $PLANFILE and extracts diffs and drifts per resource.
// This is least hacky way to get familiar terraform-formatted output,
// as all terraform packages are internal, unfortunately.
func parseTextPlan(fname string) (*textualValues, error) {
	f, err := os.Open(fname)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	diffs := make(map[string]string)
	drifts := make(map[string]string)
	outputs := make(map[string]string)

	const (
		stateMain = iota
		stateInResource
		stateInOutputs
	)
	state := stateMain

	s := bufio.NewScanner(f)
	var curDiffLines []string
	for s.Scan() {
		line := strings.TrimRightFunc(s.Text(), unicode.IsSpace)
		switch state {
		case stateMain:
			if strings.HasPrefix(line, "  # ") {
				state = stateInResource
				curDiffLines = []string{line}
			}
			if line == "Changes to Outputs:" {
				state = stateInOutputs
			}

		case stateInResource:
			curDiffLines = append(curDiffLines, line)
			if line == "    }" {
				diffHeader := curDiffLines[0]
				addr := getAddressFromTxtDiff(diffHeader)
				txtDiff := strings.Join(curDiffLines, "\n")

				if strings.HasSuffix(diffHeader, "has changed") || strings.HasSuffix(diffHeader, "has been deleted") {
					drifts[addr] = txtDiff
				} else {
					diffs[addr] = txtDiff
				}
				state = stateMain
			}

		case stateInOutputs:
			if strings.HasPrefix(line, "You can apply this plan") {
				addr := getAddressFromTxtDiff(curDiffLines[0])
				// -1 due to last empty line before the message
				outputs[addr] = strings.Join(curDiffLines[:len(curDiffLines)-1], "\n")
				state = stateMain
			}

			if ok, _ := regexp.MatchString(`^  [-+~] `, line); ok {
				if len(curDiffLines) > 0 {
					addr := getAddressFromTxtDiff(curDiffLines[0])
					outputs[addr] = strings.Join(curDiffLines, "\n")
				}
				curDiffLines = []string{line}
			} else {
				curDiffLines = append(curDiffLines, line)
			}
		}
	}

	if state == stateInOutputs && len(curDiffLines) > 0 && len(curDiffLines[0]) > 0 {
		// process the last output
		addr := getAddressFromTxtDiff(curDiffLines[0])
		outputs[addr] = strings.Join(curDiffLines, "\n")
	}

	if err := s.Err(); err != nil {
		return nil, err
	}

	return &textualValues{
		diffs:   diffs,
		drifts:  drifts,
		outputs: outputs,
	}, nil
}

// getAddressFromTxtDiff gets the Terraform resource address from a start of line of text, dropping first 4 chars.
// Examples:
// - `  # aws_vpc.this[0] will be created` -> `aws_vpc.this[0]`
// - `  # aws_vpc.this["some string"].out["bar/baz"]: ...` -> `aws_vpc.this["some string"].out["bar/baz"]`
// - `  + some_output = "test"` -> `some_output`
func getAddressFromTxtDiff(s string) string {
	s = s[4:] // trim `  [#-+~] ` prefix

	inQuoted := false
	for i, ch := range s {
		// valid TF resource address characters
		if unicode.IsLetter(ch) || unicode.IsDigit(ch) || ch == '.' || ch == '[' || ch == ']' || ch == '-' || ch == '_' {
			continue
		}

		// quoted string in resource address, allow all characters
		if inQuoted && ch != '"' {
			continue
		}

		// start/end of quoted string
		if ch == '"' {
			inQuoted = !inQuoted
			continue
		}

		// stop at the first invalid character
		return s[:i]
	}

	return ""
}
