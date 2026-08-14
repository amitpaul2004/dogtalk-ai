# 🐶 DogTalk AI

A coding-first prototype for Human ↔ Dog communication.

> **Important:** This is an experimental AI interpretation project. It does not literally translate dog language. Dog-to-human results are best-effort predictions of likely emotional/behavioral states.

## Features

- 🎙️ Record/upload a dog sound
- 🐕 Dog → Human interpretation using audio features
- 🗣️ Human → Dog command/cue mapping
- 📊 Shows estimated pitch, duration, energy and confidence
- ⚡ FastAPI backend + vanilla HTML/CSS/JS frontend

## Project structure

```text
dogtalk-ai/
├── backend/
│   ├── main.py
│   ├── audio_analyzer.py
│   └── requirements.txt
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── uploads/
│   └── .gitkeep
├── .gitignore
└── README.md
```

## Run locally

### 1. Backend

```bash
cd backend
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Backend: `http://127.0.0.1:8000`

### 2. Frontend

Open `frontend/index.html` with VS Code Live Server, or serve the frontend folder:

```bash
cd frontend
python -m http.server 5500
```

Then open `http://127.0.0.1:5500`.

## API

- `POST /api/dog-to-human` — upload an audio file
- `POST /api/human-to-dog` — convert a human command into a dog-friendly cue profile
- `GET /api/health` — health check
