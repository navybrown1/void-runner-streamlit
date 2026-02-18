from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components

ROOT = Path(__file__).resolve().parents[1]
WEB_DIR = ROOT / "web"
INDEX_PATH = WEB_DIR / "index.html"
STYLE_PATH = WEB_DIR / "style.css"
SCRIPT_PATH = WEB_DIR / "game.js"


def load_game_html() -> str:
    html = INDEX_PATH.read_text(encoding="utf-8")
    css = STYLE_PATH.read_text(encoding="utf-8")
    js = SCRIPT_PATH.read_text(encoding="utf-8")

    html = html.replace('<link rel="stylesheet" href="/style.css">', f"<style>{css}</style>")
    html = html.replace('<link rel="stylesheet" href="style.css">', f"<style>{css}</style>")
    html = html.replace('<script src="/game.js"></script>', f"<script>{js}</script>")
    html = html.replace('<script src="game.js"></script>', f"<script>{js}</script>")
    return html


def main() -> None:
    st.set_page_config(
        page_title="Void Runner",
        page_icon="🕹️",
        layout="wide",
        initial_sidebar_state="collapsed",
    )

    st.markdown(
        """
        <style>
          html, body, [data-testid="stAppViewContainer"], [data-testid="stMain"] {
            background: #000;
            height: 100%;
            overflow: hidden;
          }

          header[data-testid="stHeader"],
          [data-testid="stToolbar"],
          [data-testid="stDecoration"],
          [data-testid="stStatusWidget"],
          footer {
            display: none !important;
          }

          .block-container {
            padding: 0 !important;
            margin: 0 !important;
            max-width: 100vw !important;
            height: 100vh !important;
          }

          [data-testid="stVerticalBlock"] {
            gap: 0 !important;
          }

          [data-testid="stComponentsV1Html"] {
            width: 100vw !important;
            height: 100vh !important;
            min-height: 1000px !important;
          }

          [data-testid="stComponentsV1Html"] iframe {
            display: block;
            width: 100vw !important;
            height: 100vh !important;
            min-height: 1000px !important;
            border: 0 !important;
          }
        </style>
        """,
        unsafe_allow_html=True,
    )

    components.html(load_game_html(), height=1120, scrolling=False)


if __name__ == "__main__":
    main()
