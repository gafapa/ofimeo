package main

// Optional: serve the Ofimeo web app itself (from a directory, a .zip of the
// build, or a copy embedded at build time with -tags embedapp), so a school
// can run everything on its own network. index.html gets a marker so the app
// knows it is served by a relay and uses it (same origin /ofimeo/config).

import (
	"archive/zip"
	"bytes"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path"
	"strings"
	"time"
)

const relayMarker = `<meta name="ofimeo-relay" content="same-origin">`

// AppFiles is the web app's file tree.
type AppFiles struct {
	fsys   fs.FS
	source string
	mod    time.Time
}

func OpenApp(spec string) (*AppFiles, error) {
	if spec == "embedded" {
		if len(embeddedApp) == 0 {
			return nil, errors.New("this build does not include the web app: download the ofimeo-relay-full build, or pass a directory or .zip")
		}
		z, err := zip.NewReader(bytes.NewReader(embeddedApp), int64(len(embeddedApp)))
		if err != nil {
			return nil, err
		}
		return newAppFiles(z, "embedded", buildTime())
	}
	st, err := os.Stat(spec)
	if err != nil {
		return nil, err
	}
	if st.IsDir() {
		return newAppFiles(os.DirFS(spec), spec, st.ModTime())
	}
	z, err := zip.OpenReader(spec)
	if err != nil {
		return nil, fmt.Errorf("%s: not a directory or .zip: %w", spec, err)
	}
	return newAppFiles(z, spec, st.ModTime())
}

// newAppFiles finds index.html (at the root or in a single top folder, as in
// a zip of "dist/").
func newAppFiles(fsys fs.FS, source string, mod time.Time) (*AppFiles, error) {
	if _, err := fs.Stat(fsys, "index.html"); err != nil {
		entries, _ := fs.ReadDir(fsys, ".")
		found := false
		for _, e := range entries {
			if e.IsDir() {
				if _, err := fs.Stat(fsys, e.Name()+"/index.html"); err == nil {
					sub, err := fs.Sub(fsys, e.Name())
					if err != nil {
						return nil, err
					}
					fsys, found = sub, true
					break
				}
			}
		}
		if !found {
			return nil, fmt.Errorf("%s: index.html not found", source)
		}
	}
	return &AppFiles{fsys: fsys, source: source, mod: mod}, nil
}

func (a *AppFiles) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	name := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
	if name == "" || strings.HasSuffix(r.URL.Path, "/") {
		name = path.Join(name, "index.html")
	}
	f, err := a.fsys.Open(name)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer f.Close()
	if st, err := f.Stat(); err != nil || st.IsDir() {
		http.NotFound(w, r)
		return
	}
	data, err := io.ReadAll(f)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	base := path.Base(name)
	switch {
	case base == "index.html":
		data = bytes.Replace(data, []byte("</head>"), []byte(relayMarker+"</head>"), 1)
		w.Header().Set("Cache-Control", "no-cache")
	case base == "sw.js" || strings.HasSuffix(base, ".webmanifest"):
		w.Header().Set("Cache-Control", "no-cache")
	case strings.HasPrefix(name, "assets/"):
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	}
	if strings.HasSuffix(base, ".webmanifest") {
		w.Header().Set("Content-Type", "application/manifest+json")
	}
	http.ServeContent(w, r, base, a.mod, bytes.NewReader(data))
}
