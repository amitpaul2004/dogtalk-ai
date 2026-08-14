from pathlib import Path
import librosa
import numpy as np


def analyze_audio(path: str) -> dict:
    """Extract simple acoustic features and make a heuristic interpretation."""
    y, sr = librosa.load(path, sr=None, mono=True)
    if y.size == 0:
        raise ValueError("The uploaded audio file is empty.")

    duration = float(librosa.get_duration(y=y, sr=sr))
    rms = float(np.mean(librosa.feature.rms(y=y)))
    rms_db = float(20 * np.log10(max(rms, 1e-8)))

    f0 = librosa.yin(y, fmin=70, fmax=min(1200, sr / 2 - 1), sr=sr)
    f0 = f0[np.isfinite(f0)]
    pitch_hz = float(np.median(f0)) if f0.size else 0.0

    # Count rough bursts by thresholding short-time energy.
    rms_frames = librosa.feature.rms(y=y)[0]
    threshold = max(float(np.percentile(rms_frames, 70)), 1e-5)
    active = rms_frames > threshold
    transitions = np.diff(active.astype(np.int8), prepend=0)
    bursts = int(np.sum(transitions == 1))

    # Prototype-only heuristic. Replace with a trained classifier later.
    if pitch_hz >= 500 and bursts >= 3 and rms_db > -25:
        label = "Excited / playful"
        explanation = "The sound has relatively high pitch, energy and repeated bursts."
        confidence = 0.72
    elif pitch_hz >= 400 and rms_db < -30:
        label = "Attention seeking / whiny"
        explanation = "The sound is relatively high-pitched but low in energy."
        confidence = 0.66
    elif rms_db > -18 and pitch_hz < 350:
        label = "Alert / intense"
        explanation = "The recording has strong energy and a comparatively lower pitch."
        confidence = 0.68
    elif duration > 2.5 and rms_db < -28:
        label = "Possibly anxious / distressed"
        explanation = "The sound is sustained and relatively quiet; context is important."
        confidence = 0.55
    else:
        label = "Uncertain / needs more context"
        explanation = "The acoustic features do not strongly match the prototype categories."
        confidence = 0.40

    return {
        "label": label,
        "explanation": explanation,
        "confidence": confidence,
        "features": {
            "duration_seconds": round(duration, 2),
            "sample_rate": sr,
            "estimated_pitch_hz": round(pitch_hz, 1),
            "energy_db": round(rms_db, 2),
            "sound_bursts": bursts,
        },
    }
