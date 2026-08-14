const API = 'http://127.0.0.1:8000';
const $ = (id) => document.getElementById(id);

$('analyzeBtn').addEventListener('click', async () => {
  const file = $('audioInput').files[0];
  if (!file) return alert('Please select a dog audio file first.');
  const button = $('analyzeBtn');
  const result = $('dogResult');
  button.disabled = true;
  button.textContent = 'Analyzing...';
  result.classList.remove('hidden');
  result.innerHTML = '<p>🧠 Extracting acoustic features...</p>';

  try {
    const form = new FormData();
    form.append('file', file);
    const response = await fetch(`${API}/api/dog-to-human`, { method: 'POST', body: form });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'Analysis failed');
    result.innerHTML = `
      <h3>🐶 ${data.label}</h3>
      <p>${data.explanation}</p>
      <p><strong>Confidence:</strong> ${Math.round(data.confidence * 100)}%</p>
      <div class="stats">
        <div class="stat">Pitch: ${data.features.estimated_pitch_hz} Hz</div>
        <div class="stat">Energy: ${data.features.energy_db} dB</div>
        <div class="stat">Duration: ${data.features.duration_seconds}s</div>
        <div class="stat">Bursts: ${data.features.sound_bursts}</div>
      </div>`;
  } catch (error) {
    result.innerHTML = `<p>❌ ${error.message}</p>`;
  } finally {
    button.disabled = false;
    button.textContent = 'Analyze Dog Sound';
  }
});

$('convertBtn').addEventListener('click', async () => {
  const text = $('humanText').value.trim();
  if (!text) return alert('Enter a sentence first.');
  const button = $('convertBtn');
  const result = $('humanResult');
  button.disabled = true;
  button.textContent = 'Converting...';
  result.classList.remove('hidden');
  result.innerHTML = '<p>🐕 Building a training cue...</p>';

  try {
    const response = await fetch(`${API}/api/human-to-dog`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'Conversion failed');
    result.innerHTML = `
      <h3>🐕 ${data.cue}</h3>
      <p><strong>Tone:</strong> ${data.tone}</p>
      <p>${data.tip}</p>
      <p><small>${data.note}</small></p>`;
  } catch (error) {
    result.innerHTML = `<p>❌ ${error.message}</p>`;
  } finally {
    button.disabled = false;
    button.textContent = 'Convert to Dog Cue';
  }
});
