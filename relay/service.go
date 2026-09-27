package main

// System service (systemd on Linux, launchd on macOS, Windows service) via
// kardianos/service.

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"

	"github.com/kardianos/service"
)

func isWindowsService() bool {
	return runtime.GOOS == "windows" && !service.Interactive()
}

// serviceDataDir: where a service keeps its data (it runs as root/SYSTEM).
func serviceDataDir() string {
	switch runtime.GOOS {
	case "linux":
		return "/var/lib/ofimeo-relay"
	case "darwin":
		return "/Library/Application Support/Ofimeo Relay"
	case "windows":
		if pd := os.Getenv("ProgramData"); pd != "" {
			return filepath.Join(pd, "Ofimeo Relay")
		}
	}
	return defaultDataDir()
}

func serviceConfig(args []string) *service.Config {
	return &service.Config{
		Name:        "ofimeo-relay",
		DisplayName: "Ofimeo Relay",
		Description: "Signaling (Nostr) and TURN relay for Ofimeo documents on the local network.",
		Arguments:   append([]string{"run"}, args...),
		Option: service.KeyValue{
			"Restart":           "on-failure",
			"SuccessExitStatus": "1 2 8 SIGKILL",
			"KeepAlive":         true,
			"RunAtLoad":         true,
			"OnFailure":         "restart",
		},
	}
}

type program struct {
	cfg    Config
	cancel context.CancelFunc
	done   chan struct{}
}

func (p *program) Start(service.Service) error {
	ctx, cancel := context.WithCancel(context.Background())
	p.cancel, p.done = cancel, make(chan struct{})
	go func() {
		defer close(p.done)
		if err := run(ctx, p.cfg, false); err != nil {
			fmt.Fprintln(os.Stderr, "Error:", err)
			os.Exit(1)
		}
	}()
	return nil
}

func (p *program) Stop(service.Service) error {
	p.cancel()
	<-p.done
	return nil
}

func runService(cfg Config, args []string) error {
	s, err := service.New(&program{cfg: cfg}, serviceConfig(args))
	if err != nil {
		return err
	}
	return s.Run()
}

// cmdService installs, removes, starts or stops the system service. The
// service runs "ofimeo-relay run --data <folder> <options>".
func cmdService(action string, args []string) error {
	if action == "install" {
		hasData := false
		for _, a := range args {
			if a == "--data" || a == "-data" || len(a) > 7 && (a[:7] == "--data=" || a[:6] == "-data=") {
				hasData = true
			}
		}
		if !hasData {
			args = append([]string{"--data", serviceDataDir()}, args...)
		}
		// Check the options (and create the data folder) before installing.
		cfg, _, err := parseArgs(args)
		if err != nil {
			return err
		}
		s, err := service.New(&program{}, serviceConfig(args))
		if err != nil {
			return err
		}
		if err := s.Install(); err != nil {
			return fmt.Errorf("install (run it as administrator/root): %w", err)
		}
		if err := s.Start(); err != nil {
			return fmt.Errorf("installed, but could not start: %w", err)
		}
		fmt.Printf("Ofimeo Relay is installed as a service and running (data: %s).\nStatus page: https://localhost/ofimeo/ (or the port you chose).\n", cfg.DataDir)
		return nil
	}
	s, err := service.New(&program{}, serviceConfig(nil))
	if err != nil {
		return err
	}
	switch action {
	case "uninstall":
		_ = s.Stop()
		err = s.Uninstall()
	case "start":
		err = s.Start()
	case "stop":
		err = s.Stop()
	}
	if err == nil {
		fmt.Println("Done.")
	}
	return err
}
