package main

import (
	"flag"
	"fmt"
	"os"
	"path"

	atlantiscmd "github.com/runatlantis/atlantis/cmd"
	"github.com/runatlantis/atlantis/server"
	"github.com/runatlantis/atlantis/server/events/models"
	"github.com/runatlantis/atlantis/server/events/vcs"
	"github.com/runatlantis/atlantis/server/logging"
	"github.com/spf13/viper"
)

var atlantisConfig = flag.String("atlantis-config", "", "Path to the Atlantis config file")

var atlantisLogger logging.SimpleLogging

type atlantisFlags struct {
	AtlantisDB     string
	AtlantisURL    string
	ExecutableName string
}

func getAtlantisFlags() (*atlantisFlags, error) {
	srvCreator := &serverConfigRecorder{}

	// safe to run without change of data-dir because serverConfigRecorder only records the userConfig
	// it does not construct or start the server.
	args := []string{"--config", *atlantisConfig}

	err := startAtlantis(srvCreator, args)
	if err != nil {
		return nil, err
	}

	return &atlantisFlags{
		AtlantisDB:     path.Join(srvCreator.userConfig.DataDir, "atlantis.db"),
		AtlantisURL:    srvCreator.userConfig.AtlantisURL,
		ExecutableName: srvCreator.userConfig.ExecutableName,
	}, nil
}

func getCommentPoster() (*commentPoster, error) {
	srvCreator := &serverCreatorRecorder{}

	// don't reuse data-dir (including db), we only need this to get the vcs client
	dir := os.TempDir()
	defer os.RemoveAll(dir)

	args := []string{"--data-dir", dir, "--log-level", "error", "--config", *atlantisConfig}

	err := startAtlantis(srvCreator, args)
	if err != nil {
		return nil, err
	}

	return &commentPoster{client: srvCreator.vcsClient}, nil
}

type commentPoster struct {
	client vcs.Client
}

func (p commentPoster) postComment(repo models.Repo, pullNum int, body string) error {
	return p.client.CreateComment(atlantisLogger, repo, pullNum, body, "post-workflow-hook")
}

func startAtlantis(creator atlantiscmd.ServerCreator, args []string) error {
	if *atlantisConfig == "" {
		return fmt.Errorf("-atlantis-config flag is required")
	}

	atlantisLogger, _ = logging.NewStructuredLogger()
	atlantisLogger.SetLevel(logging.Error)

	c := &atlantiscmd.ServerCmd{
		ServerCreator: creator,
		Viper:         viper.New(),
		SilenceOutput: true,
		Logger:        atlantisLogger,
	}
	cmd := c.Init()
	cmd.SetArgs(args)

	// won't actually start the server, only construct all inner workings
	return cmd.Execute()
}

type serverConfigRecorder struct {
	userConfig server.UserConfig
}

func (s *serverConfigRecorder) NewServer(userConfig server.UserConfig, _ server.Config) (atlantiscmd.ServerStarter, error) {
	// ran only once, no need for lock
	s.userConfig = userConfig
	return &serverStarterMock{}, nil
}

type serverCreatorRecorder struct {
	vcsClient vcs.Client
}

func (s *serverCreatorRecorder) NewServer(userConfig server.UserConfig, config server.Config) (atlantiscmd.ServerStarter, error) {
	srv, err := server.NewServer(userConfig, config)
	if err != nil {
		return nil, err
	}

	// ran only once, no need for lock
	s.vcsClient = srv.VCSEventsController.VCSClient

	return &serverStarterMock{}, nil
}

type serverStarterMock struct{}

func (s *serverStarterMock) Start() error {
	return nil
}
