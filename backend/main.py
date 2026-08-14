from pathlib import Path
import shutil
import uuid

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from audio_analyzer import analyze_audio

BASE_DIR = Path(__file__).resolve().parent.parent
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

app = FastAPI(title="DogTalk AI", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class HumanCommand(BaseModel):
    text: str


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "DogTalk AI"}


@app.post("/api/dog-to-human")
async def dog_to_human(file: UploadFile = File(...)):
    allowed = {"audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp3", "audio/ogg", "audio/webm"}
    if file.content_type not in allowed:
        raise HTTPException(status_code=400, detail="Please upload WAV, MP3, OGG or WebM audio.")

    suffix = Path(file.filename or "sound.wav").suffix or ".wav"
    path = UPLOAD_DIR / f"{uuid.uuid4().hex}{suffix}"

    try:
        with path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        result = analyze_audio(str(path))
        return result
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not analyze audio: {exc}") from exc
    finally:
        path.unlink(missing_ok=True)


DOG_CUES = {
    "sit": {"cue": "SIT", "tone": "short + low", "tip": "Use one consistent word and reward immediately."},
    "stay": {"cue": "STAY", "tone": "calm + steady", "tip": "Keep the cue short and reinforce calm behavior."},
    "come": {"cue": "COME", "tone": "bright + inviting", "tip": "Use a happy voice and reward when the dog reaches you."},
    "stop": {"cue": "STOP", "tone": "firm + calm", "tip": "Avoid shouting; use the same cue consistently."},
    "down": {"cue": "DOWN", "tone": "calm + low", "tip": "Pair the cue with a hand signal during training."},
    "no": {"cue": "NO", "tone": "firm + brief", "tip": "Redirect to an acceptable behavior instead of repeating the cue."},
}


@app.post("/api/human-to-dog")
def human_to_dog(command: HumanCommand):
    text = command.text.strip().lower()
    if not text:
        raise HTTPException(status_code=400, detail="Enter a command first.")

    matched = next((key for key in DOG_CUES if key in text), None)
    if matched:
        result = DOG_CUES[matched].copy()
        result["matched_command"] = matched
        result["note"] = "This is a training cue recommendation, not a literal translation into dog language."
        return result

    return {
        "cue": "CUSTOM",
        "tone": "calm + friendly",
        "tip": "Use a short, consistent cue and reward the behavior you want.",
        "matched_command": None,
        "note": "Dogs do not have a human-language equivalent for every sentence; this prototype suggests training-style cues.",
    }
