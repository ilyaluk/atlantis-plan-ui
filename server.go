package main

import (
	"embed"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"strings"
	"syscall"
	"time"
)

//go:embed ui
var ui embed.FS

func runServeCmd(args []string) error {
	flagSet := flag.NewFlagSet("serve", flag.ExitOnError)
	addr := flagSet.String("addr", ":8080", "Address to serve on")
	outputDir := flagSet.String("output-dir", "", "Directory containing the generated JSON files")
	devUIServe := flagSet.Bool("dev-ui", false, "Serve the UI from filesystem instead of embedded")
	servePath := flagSet.String("serve-path", "/", "Path to serve the UI on")

	if err := flagSet.Parse(args); err != nil {
		return err
	}

	if *outputDir == "" {
		return fmt.Errorf("no -output-dir specified")
	}

	return runServe(*addr, *outputDir, *devUIServe, *servePath)
}

func runServe(addr, outputDir string, devUIServe bool, servePath string) error {
	uiFS, _ := fs.Sub(ui, "ui")
	if devUIServe {
		uiFS = os.DirFS("ui")
	}

	mux := http.NewServeMux()
	mux.Handle("/", http.FileServer(http.FS(uiFS)))
	mux.Handle("/plans/", http.StripPrefix("/plans/", http.FileServer(http.FS(os.DirFS(outputDir)))))

	// otherwise StripPrefix will redirect /foo to foo, which will cause redirect loops
	servePath = strings.TrimRight(servePath, "/")

	log.Printf("Serving UI on %s%s", addr, servePath)
	return http.ListenAndServe(addr, http.StripPrefix(servePath, mux))
}

func runVisualizeDriftCmd(args []string) error {
	fs := flag.NewFlagSet("visualize-drift", flag.ExitOnError)
	plansDir := fs.String("plans-dir", "", "Directory containing plan files (required)")
	addr := fs.String("addr", ":8080", "Address to serve on")

	if err := fs.Parse(args); err != nil {
		return err
	}

	if *plansDir == "" {
		return fmt.Errorf("no -plans-dir specified")
	}

	tmpDir, err := os.MkdirTemp("", "drift-ui-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(tmpDir)

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	const driftID = "drift"
	if err := runDrift(*plansDir, tmpDir, driftID); err != nil {
		return err
	}

	go func() {
		if err := runServe(*addr, tmpDir, false, "/"); err != nil {
			log.Fatal(err)
		}
	}()

	time.Sleep(100 * time.Millisecond)
	url := fmt.Sprintf("http://localhost%s/#%s", *addr, driftID)
	if err := openBrowser(url); err != nil {
		log.Printf("failed to open browser: %v", err)
		log.Printf("open %s manually", url)
	}

	<-sigCh
	return nil
}

func openBrowser(url string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "linux":
		cmd = exec.Command("xdg-open", url)
	case "darwin":
		cmd = exec.Command("open", url)
	case "windows":
		cmd = exec.Command("cmd", "/c", "start", url)
	default:
		return fmt.Errorf("unsupported platform")
	}
	return cmd.Start()
}
