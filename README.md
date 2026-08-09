# llm-go

## Adding Custom Characters

To include user-supplied character art (like the Violet character you provided) into the Dress Up game:

1. Place the image file at `web/static/assets/characters/violet.png` in the workspace (the server serves `/static/`).
2. Optionally provide metadata in `web/static/assets/characters/violet.json` (a template is included).
3. Alternatively, open the Dress Up game and use the `Import Character` button or drag-and-drop the image into the doll stage — it will be loaded and persisted in the browser's `localStorage` for that user.

Notes:
- The Dress Up UI will prefer a server-side asset if present, falling back to user-uploaded images.
- For production deployment, copy assets to the server's `web/static/assets/characters/` path so all users can see them.