//go:build embedapp

package main

import _ "embed"

// The built web app (webapp.zip, made by build.sh from ../dist) is included
// in "full" builds.
//
//go:embed webapp.zip
var embeddedApp []byte
