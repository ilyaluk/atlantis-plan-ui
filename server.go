package main

import (
	"embed"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"strings"
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
