package main

import (
	"embed"
	"flag"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"strings"
)

//go:embed ui
var ui embed.FS

var (
	devUIServe = flag.Bool("dev-ui", false, "serve the UI from filesystem instead of embedded")
	servePath  = flag.String("serve-path", "/", "path to serve the UI on")
)

func runServe(addr string) error {
	if *outputDir == "" {
		return fmt.Errorf("no -output-dir specified")
	}

	uiFS, _ := fs.Sub(ui, "ui")
	if *devUIServe {
		uiFS = os.DirFS("ui")
	}

	mux := http.NewServeMux()
	mux.Handle("/", http.FileServer(http.FS(uiFS)))
	mux.Handle("/plans/", http.StripPrefix("/plans/", http.FileServer(http.FS(os.DirFS(*outputDir)))))

	// otherwise StripPrefix will redirect /foo to foo, which will cause redirect loops
	*servePath = strings.TrimRight(*servePath, "/")

	fmt.Println("Serving UI on", addr)
	return http.ListenAndServe(addr, http.StripPrefix(*servePath, mux))
}
