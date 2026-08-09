package arcade

import "vee/internal/registry"

type GameEntry struct {
	ID          string                 `json:"id"`
	Title       string                 `json:"title"`
	Description string                 `json:"description"`
	URL         string                 `json:"url"`
	Demo        string                 `json:"demo"`
	Tags        []string               `json:"tags"`
	Data        map[string]interface{} `json:"data"`
}

func RegisterDefaultGames(reg *registry.Registry) {
	games := []registry.Entry{
		{Kind: "game", ID: "tetris", Data: map[string]interface{}{"name": "Tetris", "description": "Stack the blocks before they reach the top.", "demo": "tetris", "url": "/arcade/tetris", "tags": []string{"puzzle", "classic"}}},
		{Kind: "game", ID: "arkanoid", Data: map[string]interface{}{"name": "Arkanoid", "description": "Bounce the ball and break every brick.", "demo": "arkanoid", "url": "/arcade/arkanoid", "tags": []string{"breakout", "classic"}}},
		{Kind: "game", ID: "frogger", Data: map[string]interface{}{"name": "Frogger", "description": "Cross the road and river without getting squashed.", "demo": "frogger", "url": "/arcade/frogger", "tags": []string{"arcade", "classic"}}},
		{Kind: "game", ID: "racer", Data: map[string]interface{}{"name": "Racer", "description": "Race around the track and avoid traffic.", "demo": "racer", "url": "/arcade/racer", "tags": []string{"racing", "classic"}}},
		{Kind: "game", ID: "mario", Data: map[string]interface{}{"name": "Mario", "description": "Run and jump through a side-scrolling platform world.", "demo": "mario", "url": "/arcade/mario", "tags": []string{"platformer", "classic"}}},
		{Kind: "game", ID: "dressup", Data: map[string]interface{}{"name": "Dress Up Doll", "description": "Choose outfits and accessories for your doll.", "demo": "dressup", "url": "/arcade/dressup", "tags": []string{"creative", "casual"}}},
	}
	for _, game := range games {
		_ = reg.Register(game)
	}
}
