const API = 'http://127.0.0.1:8000';

const $ = (id) => document.getElementById(id);
let dogRecorder = null;
let dogChunks = [];
let humanRecorder = null;
let humanChunks = [];
let recognition = null;
let transcript = '';

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

function playDogCue(cue) {
  // This is a generated training-style audio cue, not a literal dog language translation.
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const ctx = new AudioContext();
  const now = ctx.currentTime;
  const frequencies = {
    SIT: [420], STAY: [360, 360], COME: [520, 680], STOP: [280], DOWN: [330], NO: [250], CUSTOM: [440]
  };
  const tones = frequencies[cue] || frequencies.CUSTOM;
  tones.forEach((frequency, index) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    const start = now + index * 0.22;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.22, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
    oscillator.start(start);
    oscillator.stop(start + 0.2);
  });
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
        const extension = blob.type.includes('mp4') ? 'm4a' : 'webm';
        form.append('file', blob, `dog-recording.${extension}`);
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
    setRecordingUI('dogWave', 'dogStatus', true, 'Listening to dog... speak/bark now');
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
    for (let i = event.resultIndex; i < event.results.length; i++) {
      text += event.results[i][0].transcript;
    }
    transcript = text.trim();
    $('transcript').textContent = transcript || 'Listening...';
  };
  r.onerror = () => {};
  return r;
}

$('humanRecordBtn').addEventListener('click', async () => {
  try {
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

      $('humanResult').innerHTML = '<p>🧠 Converting your voice into a dog-training cue...</p>';
      try {
        const response = await fetch(`${API}/api/human-to-dog`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'Voice conversion failed');

        $('humanResult').innerHTML = `
          <h3>🐕 Dog cue: ${data.cue}</h3>
          <p><strong>You said:</strong> ${text}</p>
          <p><strong>Generated cue:</strong> ${data.cue}</p>
          <p><strong>Tone:</strong> ${data.tone}</p>
          <p>${data.tip}</p>
          <button id="playCueBtn" type="button">🔊 Play Dog Cue</button>
          <p><small>${data.note}</small></p>`;
        $('playCueBtn').addEventListener('click', () => playDogCue(data.cue));
        playDogCue(data.cue);
        setRecordingUI('humanWave', 'humanStatus', false, 'Done — dog cue generated');
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
    setRecordingUI('humanWave', 'humanStatus', true, 'Listening to you... speak now');
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
