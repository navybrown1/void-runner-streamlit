# Void Runner (Streamlit)

Arcade-style browser game with neon visuals, particle FX, and synthesized audio.

## Run locally

```bash
python3 -m pip install -r requirements.txt
python3 -m streamlit run app.py --server.address 127.0.0.1 --server.port 3001
```

## Deploy to Streamlit Community Cloud

1. Push this repository to GitHub.
2. In Streamlit Community Cloud, create a new app from this repo.
3. Set the main file path to `app.py`.

The game assets are in `game/` and are inlined into the Streamlit app at runtime.
