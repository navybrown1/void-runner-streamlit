# Snake (Web + Streamlit)

Classic Snake with one shared web codebase and a thin Streamlit wrapper.

## Project layout

- `web/` static Snake build (`index.html`, `style.css`, `game.js`)
- `streamlit_wrapper/app.py` Streamlit embed wrapper
- `app.py` root launcher that runs the wrapper
- `vercel.json` Vercel rewrite config for the root route

## Controls

- Move: `Arrow Keys` or `W A S D`
- Restart: `Enter` or `R`
- Touch controls appear on narrow screens

## Run Streamlit

```bash
python3 -m pip install -r requirements.txt
python3 -m streamlit run app.py --server.address 127.0.0.1 --server.port 3001
```

Open `http://127.0.0.1:3001` in your browser.

## Run as pure web app

Serve the repo root with any static server.

```bash
python3 -m http.server 3001
```

Open `http://127.0.0.1:3001/`.

## Deploy to Vercel

- Deploy the repo as a static project.
- `vercel.json` routes `/` to `/web/index.html` and maps `/style.css` plus `/game.js` to the web assets.
