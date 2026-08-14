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
  if (!('speechSynthesis' in window)) {
    console.warn('Speech synthesis is not supported by this browser.');
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.95;
  utterance.pitch = 1;
  utterance.volume = 1;
  window.speechSynthesis.speak(utterance);
}

async function getAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error('Web Audio is not supported by this browser.');
  if (!audioContext || audioContext.state === 'closed') audioContext = new AudioContextClass();
  if (audioContext.state === 'suspended') await audioContext.resume();
  return audioContext;
}

// Generate a short bark-like training sound. This is synthetic audio, not a claim
// that it is an actual translation into dog language.
async function playDogCue(cue) {
  const ctx = await getAudioContext();
  const patterns = {
    SIT: [520],
    STAY: [430, 430],
    COME: [620, 780],
    STOP: [300],
    DOWN: [380],
    NO: [260],
    CUSTOM: [500]
  };
  const frequencies = patterns[cue] || patterns.CUSTOM;
  const startTime = ctx.currentTime + 0.03;

  frequencies.forEach((frequency, index) => {
    const start = startTime + index * 0.28;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(frequency * 0.72, start);
    oscillator.frequency.exponentialRampToValueAtTime(frequency, start + 0.06);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.55, start + 0.20);

    filter.type = 'bandpass';
    filter.frequency.value = frequency * 1.4;
    filter.Q.value = 1.2;

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.32, start + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.21);

    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.23);
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
        form.append('file', blob, 'dog-recording.webm');
        const response = await fetch(`${API}/api/dog-to-human`, { method: 'POST', body: form });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'Dog audio analysis failed');

        const message = `Your dog may be ${data.label.toLowerCase()}. ${data.explanation}`;
        $('dogResult').innerHTML = `
          <h3>🗣️ Human voice interpretation</h3>
          <p>${message}</p>
          <p><strong>Confidence:</strong> ${Math.round(data.confidence * 100)}%</p>
          <div class="stats">
            <div class="stat">Pitch: ${data.features.estimated_pitch_hz} Hz</div>
            <div class="stat">Energy: ${data.features.energy_db} dB</div>
            <div class="stat">Duration: ${data.features.duration_seconds}s</div>
            <div class="stat">Bursts: ${data.features.sound_bursts}</div>
          </div>
          <button id="speakInterpretationBtn" type="button">🔊 Speak Interpretation Again</button>`;
        $('speakInterpretationBtn').addEventListener('click', () => speakHuman(message));
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
  r.onerror = (event) => console.warn('Speech recognition:', event.error);
  return r;
}

$('humanRecordBtn').addEventListener('click', async () => {
  try {
    // Create/resume the audio context from the user's click so Chrome allows audio output later.
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
        $('humanResult').innerHTML = '<p>❌ I could not understand your voice. Please allow microphone access and speak clearly.</p>';
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
          <h3>🐕 Dog voice cue: ${data.cue}</h3>
          <p><strong>You said:</strong> ${text}</p>
          <p><strong>Generated dog cue:</strong> ${data.cue}</p>
          <p><strong>Tone:</strong> ${data.tone}</p>
          <p>${data.tip}</p>
          <button id="playCueBtn" type="button">🔊 Play Dog Cue</button>
          <p><small>This is a synthetic dog-like training sound, not literal dog language.</small></p>`;

        $('playCueBtn').addEventListener('click', async () => {
          const button = $('playCueBtn');
          button.disabled = true;
          button.textContent = '🔊 Playing...';
          try {
            await playDogCue(data.cue);
          } catch (error) {
            button.textContent = '❌ Audio unavailable';
            console.error(error);
          } finally {
            setTimeout(() => {
              button.disabled = false;
              button.textContent = '🔊 Play Dog Cue';
            }, 500);
          }
        });

        setRecordingUI('humanWave', 'humanStatus', false, 'Done — dog voice cue ready');
      } catch (error) {
        $('humanResult').innerHTML = `<p>❌ ${error.message}</p>`;
        setRecordingUI('humanWave', 'humanStatus', false, 'Conversion failed');
      }
    };

    humanRecorder.start();
    recognition = setupSpeechRecognition();
    if (recognition) {
      try { recognition.start(); } catch (_) {}
    } else {
      $('transcript').textContent = 'Speech recognition is unavailable in this browser.';
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
