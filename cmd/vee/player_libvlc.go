//go:build libvlc

package main

import "vee/internal/audio"

func newAudioPlayer() (audio.Player, error) {
	return audio.NewLibVLCPlayer()
}
