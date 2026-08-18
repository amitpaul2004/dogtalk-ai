from pathlib import Path
import re
import shutil
import uuid

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from audio_analyzer import analyze_audio

BASE_DIR = Path(__file__).resolve().parent.parent
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

app = FastAPI(title="DogTalk AI", version="0.2.0")

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
        return analyze_audio(str(path))
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not analyze audio: {exc}") from exc
    finally:
        path.unlink(missing_ok=True)


# BarkCode is a project-defined communication protocol. Each intent has a stable
# sequence so a dog can be trained to associate that real-bark pattern with a meaning.
INTENTS = [
    ("greeting", ["hello", "hi", "hey", "good morning", "good afternoon", "good evening"], "HELLO", [1, 1], "friendly greeting"),
    ("identity", ["i am", "i'm", "my name is", "this is me", "this is"], "IDENTITY", [2, 1, 2], "identity / introduction"),
    ("yes", ["yes", "yeah", "yep", "okay", "ok", "sure", "correct", "right"], "YES", [1], "agreement"),
    ("no", ["no", "nope", "never", "don't", "do not", "not now"], "NO", [3, 1], "refusal / negative"),
    ("thanks", ["thank you", "thanks", "thx"], "THANKS", [1, 1, 1], "thanks"),
    ("sorry", ["sorry", "i apologize", "apologies", "my fault"], "SORRY", [2, 1], "apology"),
    ("love", ["i love you", "love you", "i adore you", "miss you", "i miss you"], "LOVE", [1, 2, 1, 2], "affection"),
    ("help", ["help", "help me", "i need help", "can you help", "please help"], "HELP", [3, 2, 3], "request for help"),
    ("food", ["food", "hungry", "eat", "dinner", "lunch", "breakfast", "treat", "snack", "meal"], "FOOD", [2, 1, 2], "food / hunger"),
    ("water", ["water", "drink", "thirsty"], "WATER", [1, 3, 1], "water / thirst"),
    ("walk", ["walk", "walkies", "go outside", "outside", "park", "go for a walk"], "WALK", [2, 2, 1], "walk / outdoors"),
    ("play", ["play", "playtime", "toy", "ball", "fetch", "let's play"], "PLAY", [1, 1, 2, 1], "play"),
    ("sleep", ["sleep", "bed", "bedtime", "go to sleep", "tired", "rest"], "SLEEP", [2, 2], "sleep / rest"),
    ("potty", ["potty", "toilet", "pee", "poop", "bathroom", "need to go"], "POTTY", [2, 1, 2], "toilet need"),
    ("come", ["come", "come here", "come to me", "come back", "here"], "COME", [2, 1, 2], "come here"),
    ("sit", ["sit", "sit down"], "SIT", [1, 2], "sit"),
    ("stay", ["stay", "wait", "hold on", "don't move", "remain"], "STAY", [2, 3], "stay / wait"),
    ("down", ["down", "lie down", "lay down"], "DOWN", [3, 1], "down"),
    ("stop", ["stop", "enough", "leave it", "drop it", "quit"], "STOP", [3, 2, 3], "stop / leave it"),
    ("good", ["good boy", "good girl", "well done", "good job", "great job", "good"], "GOOD", [1, 1, 1], "praise"),
    ("danger", ["danger", "dangerous", "careful", "watch out", "be careful", "run away"], "DANGER", [3, 3, 1, 3], "danger / warning"),
    ("pain", ["hurt", "pain", "i'm hurt", "it hurts", "sick", "not feeling well"], "PAIN", [3, 2, 3, 2], "pain / illness"),
    ("fear", ["scared", "afraid", "fear", "frightened", "terrified"], "FEAR", [3, 1, 3], "fear"),
    ("happy", ["happy", "excited", "yay", "awesome", "wonderful", "i'm happy"], "HAPPY", [1, 1, 1, 2], "happiness / excitement"),
    ("sad", ["sad", "crying", "upset", "lonely", "i'm sad"], "SAD", [2, 3, 2], "sadness"),
    ("attention", ["look at me", "listen", "attention", "come here", "hey"], "ATTENTION", [1, 3, 1], "attention"),
    ("home", ["home", "go home", "at home", "inside"], "HOME", [2, 1, 1], "home / indoors"),
    ("car", ["car", "drive", "ride", "go in the car"], "CAR", [1, 2, 2], "car / travel"),
    ("bath", ["bath", "bathe", "shower", "wash", "clean up"], "BATH", [3, 1, 2], "bath / grooming"),
    ("vet", ["vet", "veterinarian", "doctor", "clinic", "hospital"], "VET", [2, 3, 2], "vet / medical visit"),
    ("owner", ["owner", "my human", "my person", "dad", "mom", "family"], "OWNER", [2, 1, 2], "owner / family"),
]

INTENT_BY_KEY = {item[0]: item for item in INTENTS}


def contains_phrase(text: str, phrase: str) -> bool:
    if " " in phrase or "'" in phrase:
        return phrase in text
    return re.search(rf"\b{re.escape(phrase)}\b", text) is not None


def classify_sentence(sentence: str):
    text = re.sub(r"\s+", " ", sentence.lower()).strip()
    best = None
    best_score = 0
    for key, phrases, cue, pattern, label in INTENTS:
        score = 0
        for phrase in phrases:
            if contains_phrase(text, phrase):
                score += max(1, len(phrase.split()))
        if score > best_score:
            best_score = score
            best = (key, phrases, cue, pattern, label)

    if best:
        key, _, cue, pattern, label = best
        return {
            "intent": key,
            "cue": cue,
            "label": label,
            "pattern": pattern,
            "matched": True,
        }

    # Generic language fallback: keep a stable BarkCode instead of simply
    # mapping the number of words to the number of barks.
    if "?" in sentence or re.match(r"^(who|what|when|where|why|how|can|could|would|will)\b", text):
        fallback = ("question", "QUESTION", [2, 1, 2], "question / seeking information")
    elif re.search(r"\b(please|can you|could you|would you|i need|i want)\b", text):
        fallback = ("request", "REQUEST", [1, 3, 2], "request")
    elif re.search(r"\b(love|like|enjoy|beautiful|amazing|great|happy)\b", text):
        fallback = ("positive", "POSITIVE", [1, 1, 2], "positive statement")
    elif re.search(r"\b(hate|angry|bad|wrong|upset|sad)\b", text):
        fallback = ("negative", "NEGATIVE", [3, 2, 1], "negative statement")
    else:
        fallback = ("statement", "STATEMENT", [1, 2, 1], "general statement")
    key, cue, pattern, label = fallback
    return {"intent": key, "cue": cue, "label": label, "pattern": pattern, "matched": False}


def split_sentences(text: str):
    parts = [part.strip() for part in re.split(r"(?<=[.!?])\s+|[,;]+\s+", text) if part.strip()]
    return parts or [text.strip()]


@app.post("/api/human-to-dog")
def human_to_dog(command: HumanCommand):
    text = command.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Enter a sentence first.")

    segments = [classify_sentence(part) for part in split_sentences(text)]
    return {
        "cue": segments[0]["cue"] if len(segments) == 1 else "COMPOSED",
        "intent": segments[0]["intent"] if len(segments) == 1 else "composed",
        "label": segments[0]["label"] if len(segments) == 1 else "multiple meanings",
        "pattern": segments[0]["pattern"] if len(segments) == 1 else [],
        "segments": segments,
        "matched_command": segments[0]["intent"] if len(segments) == 1 and segments[0]["matched"] else None,
        "note": "BarkCode is a project-defined training protocol. Dogs would need to be trained to associate each bark pattern with its meaning; this is not a scientifically proven literal translation of human language into dog language.",
    }
