# Void Runner (Web + Streamlit)

Neon arcade shooter with one shared game codebase.

## Project layout

- `web/` static web build (`index.html`, `style.css`, `game.js`)
- `streamlit_wrapper/app.py` Streamlit embed wrapper
- `app.py` root launcher that runs the wrapper
- `vercel.json` Vercel rewrite config for root route

## Controls

- P1 move: `Arrow Keys`
- P1 fire: `Space` (hold to continuous fire)
- P2 move: `W A S D`
- P2 fire: `F` (hold to continuous fire)
- Deploy/redeploy: `Enter` or click `DEPLOY NOW`
- Pause/resume: `P` / `Esc` or click `PAUSE`
- Mode select: click `1 PLAYER` / `2 PLAYERS`
- Mute toggle: `M` or click `SOUND` button
- Debug perf overlay: `?debug=1` in URL or `F3`

## Run Streamlit

```bash
python3 -m pip install -r requirements.txt
python3 -m streamlit run app.py --server.address 127.0.0.1 --server.port 3001
```

## Run as pure web app

Serve the `web/` folder with any static server.

```bash
python3 -m http.server 3001
# open http://127.0.0.1:3001/web/
```

## Deploy to Vercel

- Deploy repo as a static project.
- `vercel.json` routes `/` to `/web/index.html` and maps `/style.css` + `/game.js` to `/web` assets.
