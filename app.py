from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components

ROOT = Path(__file__).resolve().parent
GAME_DIR = ROOT / "game"
INDEX_PATH = GAME_DIR / "index.html"
STYLE_PATH = GAME_DIR / "style.css"
SCRIPT_PATH = GAME_DIR / "game.js"


def load_game_html() -> str:
    html = INDEX_PATH.read_text(encoding="utf-8")
    css = STYLE_PATH.read_text(encoding="utf-8")
    js = SCRIPT_PATH.read_text(encoding="utf-8")

    html = html.replace('<link rel="stylesheet" href="style.css">', f"<style>{css}</style>")
    html = html.replace('<script src="game.js"></script>', f"<script>{js}</script>")
    return html


st.set_page_config(page_title="Void Runner", page_icon="🕹️", layout="wide")

st.markdown(
    """
    <style>
      .block-container {padding-top: 0.6rem; padding-bottom: 0.4rem; max-width: 100%;}
      footer {visibility: hidden;}
      [data-testid="stHeader"] {height: 0;}
    </style>
    """,
    unsafe_allow_html=True,
)

st.title("Void Runner")
st.caption("Arcade survival game with visual FX and synthesized audio")

components.html(load_game_html(), height=960, scrolling=False)
