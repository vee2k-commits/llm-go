# llm-go

## Adding Custom Characters

To include user-supplied character art (like the Violet character you provided) into the Dress Up game:

1. Place the image file at `web/static/assets/characters/violet.png` in the workspace (the server serves `/static/`).
2. Optionally provide metadata in `web/static/assets/characters/violet.json` (a template is included).
3. Alternatively, open the Dress Up game and use the `Import Character` button or drag-and-drop the image into the doll stage — it will be loaded and persisted in the browser's `localStorage` for that user.

Notes:
- The Dress Up UI will prefer a server-side asset if present, falling back to user-uploaded images.
- For production deployment, copy assets to the server's `web/static/assets/characters/` path so all users can see them.

## Converting character art to sprite sheets

A small utility is provided to convert a single image into a simple sprite sheet for use in games.

Install the Python dependency and run the converter:

```bash
python3 -m pip install -r tools/requirements.txt
python3 tools/convert_sprite.py input.png web/static/assets/characters/violet/sheet.png --cols 4 --rows 1 --frame-w 64 --frame-h 64
```

The script will emit a JSON metadata blob describing the sheet layout.

## Uploading characters to the server

You can upload images so they are available to all users by POSTing a multipart form to `/api/characters/upload` with fields `id` (e.g. `violet`) and `file` (the image file):

```bash
curl -F "id=violet" -F "file=@violet.png" http://localhost:8080/api/characters/upload
```

This saves the file under `web/static/assets/characters/<id>/` and writes a `metadata.json` pointing at the uploaded image.