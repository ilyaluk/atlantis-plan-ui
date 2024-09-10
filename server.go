package main

import (
	"embed"
	"flag"
	"fmt"
	"io/fs"
	"net/http"
	"os"
)

//go:embed ui
var ui embed.FS

var devUIServe = flag.Bool("dev-ui", false, "serve the UI from filesystem instead of embedded")

func runServe(addr string) error {
	if *outputDir == "" {
		return fmt.Errorf("no -output-dir specified")
	}

	uiFS, _ := fs.Sub(ui, "ui")
	if *devUIServe {
		uiFS = os.DirFS("ui")
	}
	http.Handle("/", http.FileServer(http.FS(uiFS)))

	http.Handle("/plans/", http.StripPrefix("/plans/", http.FileServer(http.FS(os.DirFS(*outputDir)))))

	fmt.Println("Serving UI on", addr)
	return http.ListenAndServe(addr, nil)
}
