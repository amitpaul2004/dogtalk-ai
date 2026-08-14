const API = 'http://127.0.0.1:8000';

const $ = (id) => document.getElementById(id);
let dogRecorder = null;
let dogChunks = [];
let humanRecorder = null;
let humanChunks = [];
let recognition = null;
let transcript = '';
let audioContext = null;

function setRecordingUI(waveId, statusId, active, message) {
  $(waveId).classList.toggle('active', active);
  $(statusId).textContent = message;
}

function speakHuman(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.95;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

function getAudioContext() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) throw new Error('Web Audio is not supported in this browser.');
  if (!audioContext) audioContext = new Ctx();
  if (audioContext.state === 'suspended') return audioContext.resume().then(() => audioContext);
  return Promise.resolve(audioContext);
}

// Creates a short dog-like bark using filtered noise + pitch movement.
function bark(ctx, start, duration, pitch, volume) {
  const sampleRate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(sampleRate * duration));
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    const t = i / length;
    const envelope = Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 0.7;
    const grit = (Math.random() * 2 - 1) * envelope;
    const tone = Math.sin(2 * Math.PI * pitch * (0.75 + 0.25 * (1 - t)) * i / sampleRate);
    data[i] = (0.62 * grit + 0.38 * tone) * envelope;
  }

  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(Math.min(2600, pitch * 3.2), start);
  filter.Q.value = 1.1;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.buffer = buffer;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start(start);
  source.stop(start + duration + 0.02);
}

// Converts the complete human sentence into a repeatable bark pattern.
// This is a communication experiment, NOT a scientifically decoded dog language.
async function playDogVoice(text, cue) {
  const ctx = await getAudioContext();
  const normalized = (text || '').trim();
  const words = normalized ? normalized.split(/\s+/).filter(Boolean) : [cue || 'CUSTOM'];
  const wordCount = Math.min(Math.max(words.length, 2), 18);
  const base = cue === 'STOP' || cue === 'NO' ? 260 : cue === 'COME' ? 560 : 430;
  const now = ctx.currentTime + 0.04;

  // Each word contributes a bark unit. Sentence length changes rhythm.
  // Character values create a deterministic pitch pattern for the same sentence.
  for (let i = 0; i < wordCount; i++) {
    const word = words[i % words.length];
    const code = [...word].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
    const pitch = Math.max(180, Math.min(950, base + (code % 260) - 90));
    const duration = 0.12 + ((code % 7) * 0.018);
    const gap = 0.11 + ((word.length + i) % 4) * 0.035;
    bark(ctx, now + i * (duration + gap), duration, pitch, 0.75);
  }

  // Short ending bark marks the end of the sentence.
  bark(ctx, now + wordCount * 0.21 + 0.04, 0.16, base + 120, 0.68);
}

async function getMicrophone() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Your browser does not support microphone recording. Use Chrome or Edge over localhost.');
  }
  return navigator.mediaDevices.getUserMedia({ audio: true });
}

// ---------------- DOG VOICE -> HUMAN VOICE ----------------
$('dogRecordBtn').addEventListener('click', async () => {
  try {
    const stream = await getMicrophone();
    dogChunks = [];
    dogRecorder = new MediaRecorder(stream);
    dogRecorder.ondataavailable = (event) => { if (event.data.size) dogChunks.push(event.data); };
    dogRecorder.onstop = async () => {
      stream.getTracks().forEach(track => track.stop());
      const blob = new Blob(dogChunks, { type: dogRecorder.mimeType || 'audio/webm' });
      const url = URL.createObjectURL(blob);
      $('dogPreview').src = url;
      $('dogPreview').classList.remove('hidden');

      setRecordingUI('dogWave', 'dogStatus', false, 'Analyzing dog sound...');
      $('dogResult').classList.remove('hidden');
      $('dogResult').innerHTML = '<p>🧠 Listening to the dog sound...</p>';

      try {
        const form = new FormData();
        form.append('file', blob, 'dog-recording.webm');
        const response = await fetch(`${API}/api/dog-to-human`, { method: 'POST', body: form });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'Dog audio analysis failed');

        const message = `Your dog may be ${data.label.toLowerCase()}. ${data.explanation}`;
        $('dogResult').innerHTML = `
          <h3>🗣️ Human interpretation</h3>
          <p>${message}</p>
          <p><strong>Confidence:</strong> ${Math.round(data.confidence * 100)}%</p>
          <div class="stats">
            <div class="stat">Pitch: ${data.features.estimated_pitch_hz} Hz</div>
            <div class="stat">Energy: ${data.features.energy_db} dB</div>
            <div class="stat">Duration: ${data.features.duration_seconds}s</div>
            <div class="stat">Bursts: ${data.features.sound_bursts}</div>
          </div>`;
        speakHuman(message);
        setRecordingUI('dogWave', 'dogStatus', false, 'Done — interpretation spoken aloud');
      } catch (error) {
        $('dogResult').innerHTML = `<p>❌ ${error.message}</p>`;
        setRecordingUI('dogWave', 'dogStatus', false, 'Analysis failed');
      }
    };

    dogRecorder.start();
    $('dogRecordBtn').disabled = true;
    $('dogStopBtn').disabled = false;
    setRecordingUI('dogWave', 'dogStatus', true, 'Listening to dog... bark now');
  } catch (error) {
    $('dogResult').classList.remove('hidden');
    $('dogResult').innerHTML = `<p>❌ ${error.message}</p>`;
  }
});

$('dogStopBtn').addEventListener('click', () => {
  if (dogRecorder && dogRecorder.state !== 'inactive') dogRecorder.stop();
  $('dogRecordBtn').disabled = false;
  $('dogStopBtn').disabled = true;
});

// ---------------- HUMAN VOICE -> DOG VOICE ----------------
function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;
  const r = new SpeechRecognition();
  r.continuous = true;
  r.interimResults = true;
  r.lang = 'en-IN';
  r.onresult = (event) => {
    let text = '';
    for (let i = event.resultIndex; i < event.results.length; i++) text += event.results[i][0].transcript;
    transcript = text.trim();
    $('transcript').textContent = transcript || 'Listening...';
  };
  r.onerror = () => {};
  return r;
}

$('humanRecordBtn').addEventListener('click', async () => {
  try {
    await getAudioContext();
    const stream = await getMicrophone();
    humanChunks = [];
    transcript = '';
    $('transcript').textContent = 'Listening to your voice...';
    humanRecorder = new MediaRecorder(stream);
    humanRecorder.ondataavailable = (event) => { if (event.data.size) humanChunks.push(event.data); };
    humanRecorder.onstop = async () => {
      stream.getTracks().forEach(track => track.stop());
      if (recognition) { try { recognition.stop(); } catch (_) {} }
      $('humanResult').classList.remove('hidden');

      const text = transcript.trim();
      if (!text) {
        $('humanResult').innerHTML = '<p>❌ I could not understand your voice. Please speak clearly and try again.</p>';
        setRecordingUI('humanWave', 'humanStatus', false, 'No speech detected');
        return;
      }

      $('humanResult').innerHTML = '<p>🧠 Converting the complete sentence into a dog vocalization...</p>';
      try {
        const response = await fetch(`${API}/api/human-to-dog`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'Voice conversion failed');

        $('humanResult').innerHTML = `
          <h3>🐕 Dog vocalization generated</h3>
          <p><strong>Human said:</strong> ${text}</p>
          <p><strong>Interpreted intent:</strong> ${data.cue}</p>
          <p><strong>Pattern:</strong> ${wordCountDescription(text)}</p>
          <p>${data.tip}</p>
          <button id="playCueBtn" type="button">🐕🔊 Play Dog Vocalization</button>
          <p><small>This is a synthetic bark encoding of the sentence, not a proven translation into dog language.</small></p>`;
        $('playCueBtn').addEventListener('click', () => playDogVoice(text, data.cue));
        setRecordingUI('humanWave', 'humanStatus', false, 'Done — dog vocalization ready');
      } catch (error) {
        $('humanResult').innerHTML = `<p>❌ ${error.message}</p>`;
        setRecordingUI('humanWave', 'humanStatus', false, 'Conversion failed');
      }
    };

    humanRecorder.start();
    recognition = setupSpeechRecognition();
    if (recognition) {
      try { recognition.start(); } catch (_) {}
    }
    $('humanRecordBtn').disabled = true;
    $('humanStopBtn').disabled = false;
    setRecordingUI('humanWave', 'humanStatus', true, 'Listening to you... speak the full sentence');
  } catch (error) {
    $('humanResult').classList.remove('hidden');
    $('humanResult').innerHTML = `<p>❌ ${error.message}</p>`;
  }
});

$('humanStopBtn').addEventListener('click', () => {
  if (humanRecorder && humanRecorder.state !== 'inactive') humanRecorder.stop();
  $('humanRecordBtn').disabled = false;
  $('humanStopBtn').disabled = true;
});

function wordCountDescription(text) {
  const count = text.trim().split(/\s+/).filter(Boolean).length;
  return `${Math.min(Math.max(count, 2), 18)} bark units based on the spoken sentence`;
}
