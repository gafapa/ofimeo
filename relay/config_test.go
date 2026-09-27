package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadConfigMovesLegacyAppURL(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, configFileName), []byte(`{"app_url":"`+legacyAppURL+`"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	cfg, err := loadConfig(dir)
	if err != nil {
		t.Fatal(err)
	}
	if want := defaultConfig().AppURL; cfg.AppURL != want {
		t.Fatalf("AppURL = %q, want %q", cfg.AppURL, want)
	}
}
