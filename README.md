# Void Runner: Hyperdrive Overclock

An upgraded neon arcade shooter with wave escalation, boss fights, event waves, and an ultimate ability system.

## Features

- 6 weapon systems with distinct behavior.
- Hyper Meter + **Hyper Nova** ultimate blast.
- Combo-driven **Frenzy Mode**.
- Dynamic events: Meteor Storm, Drone Swarm, Elite Rain.
- Boss phase pressure with drone reinforcements.
- 1-player and 2-player keyboard co-op.
- Persistent best score / best wave tracking.
- Streamlit wrapper for browser deployment.

## Local Run

```bash
python3 -m pip install -r requirements.txt
python3 -m streamlit run app.py --server.address 127.0.0.1 --server.port 3002
```

## Controls

- P1 move: `Arrow Keys`
- P1 fire: `Space`
- P1 switch weapon: `Q`
- P1 dash: `Shift`
- P1 Hyper Nova: `X`
- P2 move: `W A S D`
- P2 fire: `F`
- P2 switch weapon: `E`
- P2 dash: `C`
- P2 Hyper Nova: `V`
- Sound toggle: `M`

## Streamlit Cloud Deploy

1. Push this repo to GitHub.
2. In Streamlit Community Cloud, create a new app from this repo.
3. Set main file path to `app.py`.
