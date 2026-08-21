const API = (() => {
  const configured = window.DOGTALK_API_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  const host = window.location.hostname;
  return ['localhost', '127.0.0.1', '::1', ''].includes(host) ? 'http://127.0.0.1:8000' : '';
})();

// Real recorded dog bark. BarkCode changes the sequence, timing and playback
// characteristics; it never turns the bark into a synthetic machine tone.
const REAL_DOG_BARK_URL = 'https://orangefreesounds.com/wp-content/uploads/2026/04/Dog-barking-sound-effect-loud-natural-bark.mp3';
const $ = id => document.getElementById(id);
let dogRecorder = null, dogChunks = [], humanRecorder = null, recognition = null, transcript = '';

function setRecordingUI(waveId, statusId, active, message) { $(waveId).classList.toggle('active', active); $(statusId).textContent = message; }
function apiUrl(path) { return `${API}${path}`; }
async function fetchJson(path, options = {}, timeoutMs = 15000) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(apiUrl(path), { ...options, signal: controller.signal });
    const raw = await response.text(); let data = {}; try { data = raw ? JSON.parse(raw) : {}; } catch (_) {}
    if (!response.ok) throw new Error(data.detail || `Request failed (${response.status})`);
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The DogTalk backend took too long to respond.');
    if (error instanceof TypeError) throw new Error('Cannot connect to the DogTalk backend.');
    throw error;
  } finally { clearTimeout(timer); }
}
function speakHuman(text) { if (!('speechSynthesis' in window)) return; speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.rate = 0.95; u.pitch = 1; speechSynthesis.speak(u); }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// Local fallback BarkCode library. The backend contains the same larger library.
const LOCAL_BARK_INTENTS = [
  ['greeting',['hello','hi','hey','good morning','good afternoon','good evening'],'HELLO',[1,1]],
  ['identity',['i am',"i'm",'my name is','this is me'],'IDENTITY',[2,1,2]],
  ['yes',['yes','yeah','yep','okay','ok','sure','correct','right'],'YES',[1]],
  ['no',['no','nope','never',"don't",'do not'],'NO',[3,1]],
  ['thanks',['thank you','thanks'],'THANKS',[1,1,1]],
  ['sorry',['sorry','i apologize','apologies'],'SORRY',[2,1]],
  ['love',['i love you','love you','i adore you','miss you','i miss you'],'LOVE',[1,2,1,2]],
  ['help',['help','help me','i need help','can you help'],'HELP',[3,2,3]],
  ['food',['food','hungry','eat','dinner','lunch','breakfast','treat','snack','meal'],'FOOD',[2,1,2]],
  ['water',['water','drink','thirsty'],'WATER',[1,3,1]],
  ['walk',['walk','walkies','go outside','outside','park','go for a walk'],'WALK',[2,2,1]],
  ['play',['play','playtime','toy','ball','fetch',"let's play"],'PLAY',[1,1,2,1]],
  ['sleep',['sleep','bed','bedtime','go to sleep','tired','rest'],'SLEEP',[2,2]],
  ['potty',['potty','toilet','pee','poop','bathroom'],'POTTY',[2,1,2]],
  ['come',['come','come here','come to me','come back'],'COME',[2,1,2]],
  ['sit',['sit','sit down'],'SIT',[1,2]],
  ['stay',['stay','wait','hold on',"don't move"],'STAY',[2,3]],
  ['down',['down','lie down','lay down'],'DOWN',[3,1]],
  ['stop',['stop','enough','leave it','drop it','quit'],'STOP',[3,2,3]],
  ['good',['good boy','good girl','well done','good job','great job'],'GOOD',[1,1,1]],
  ['danger',['danger','dangerous','careful','watch out','be careful'],'DANGER',[3,3,1,3]],
  ['pain',['hurt','pain',"i'm hurt",'it hurts','sick','not feeling well'],'PAIN',[3,2,3,2]],
  ['fear',['scared','afraid','fear','frightened','terrified'],'FEAR',[3,1,3]],
  ['happy',['happy','excited','yay','awesome','wonderful',"i'm happy"],'HAPPY',[1,1,1,2]],
  ['sad',['sad','crying','upset','lonely',"i'm sad"],'SAD',[2,3,2]],
  ['attention',['look at me','listen','attention','hey'],'ATTENTION',[1,3,1]],
  ['home',['home','go home','at home','inside'],'HOME',[2,1,1]],
  ['car',['car','drive','ride','go in the car'],'CAR',[1,2,2]],
  ['bath',['bath','bathe','shower','wash','clean up'],'BATH',[3,1,2]],
  ['vet',['vet','veterinarian','doctor','clinic','hospital'],'VET',[2,3,2]],
  ['owner',['owner','my human','my person','dad','mom','family'],'OWNER',[2,1,2]]
];
function phraseMatch(text, phrase) {
  if (phrase.includes(' ') || phrase.includes("'")) return text.includes(phrase);
  return new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\b`, 'i').test(text);
}
function localClassify(text) {
  const normalized = text.toLowerCase().replace(/\s+/g,' ').trim(); let best = null, score = 0;
  for (const [intent, phrases, cue, pattern] of LOCAL_BARK_INTENTS) { let current = 0; for (const phrase of phrases) if (phraseMatch(normalized,phrase)) current += phrase.split(/\s+/).length; if (current > score) { score = current; best = {intent,cue,pattern,label:intent}; } }
  if (best) return {...best,matched:true};
  if (/[?]/.test(text) || /^(who|what|when|where|why|how|can|could|would|will)\b/i.test(normalized)) return {intent:'question',cue:'QUESTION',pattern:[2,1,2],label:'question',matched:false};
  if (/\b(please|can you|could you|would you|i need|i want)\b/i.test(normalized)) return {intent:'request',cue:'REQUEST',pattern:[1,3,2],label:'request',matched:false};
  if (/\b(love|like|enjoy|beautiful|amazing|great|happy)\b/i.test(normalized)) return {intent:'positive',cue:'POSITIVE',pattern:[1,1,2],label:'positive statement',matched:false};
  if (/\b(hate|angry|bad|wrong|upset|sad)\b/i.test(normalized)) return {intent:'negative',cue:'NEGATIVE',pattern:[3,2,1],label:'negative statement',matched:false};
  return {intent:'statement',cue:'STATEMENT',pattern:[1,2,1],label:'general statement',matched:false};
}
function splitSentenceParts(text) { return (text.match(/[^.!?,;]+[.!?,;]?/g) || [text]).map(s=>s.trim()).filter(Boolean); }
function localHumanToDog(text) { const segments = splitSentenceParts(text).map(localClassify); return {cue:segments.length===1?segments[0].cue:'COMPOSED',intent:segments.length===1?segments[0].intent:'composed',label:segments.length===1?segments[0].label:'multiple meanings',pattern:segments.length===1?segments[0].pattern:[],segments,note:'BarkCode is a project-defined training protocol, not a proven literal translation into dog language.'}; }
function buildBarkSegments(data,text) { return Array.isArray(data?.segments) && data.segments.length ? data.segments : localHumanToDog(text).segments; }

// Every bark below is a real recording. The meaning is encoded by the repeat/pause pattern.
async function playBarkCode(segments) {
  if (!segments?.length) return;
  for (const segment of segments) {
    const pattern = Array.isArray(segment.pattern) && segment.pattern.length ? segment.pattern : [1,2,1];
    for (let index=0; index<pattern.length; index++) {
      const intensity = pattern[index]; const audio = new Audio(REAL_DOG_BARK_URL); audio.preload='auto';
      audio.volume = intensity===3 ? 0.85 : intensity===2 ? 0.72 : 0.62;
      audio.playbackRate = intensity===3 ? 0.94 : intensity===2 ? 1 : 1.06;
      try {
        await audio.play();
        await new Promise(resolve => { audio.addEventListener('ended',resolve,{once:true}); setTimeout(resolve,1800); });
      } catch (_) { $('humanResult')?.insertAdjacentHTML('beforeend','<p class="audio-help"><i class="bi bi-info-circle-fill"></i> Tap Play Dog Vocalization again if the browser blocked the audio.</p>'); return; }
      if (index < pattern.length-1) await sleep(intensity===3?420:300);
    }
    await sleep(650);
  }
}

async function getMicrophone() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Your browser does not support microphone access. Use Chrome or Edge over localhost or HTTPS.');
  if (typeof MediaRecorder === 'undefined') throw new Error('Your browser does not support audio recording. Use an up-to-date version of Chrome, Edge or Firefox.');
  return navigator.mediaDevices.getUserMedia({audio:true});
}
async function analyzeDogAudioLocally(blob) {
  const Ctx=window.AudioContext||window.webkitAudioContext; if(!Ctx) throw new Error('Local audio analysis is not supported by this browser.'); const ctx=new Ctx();
  try { const buffer=await ctx.decodeAudioData(await blob.arrayBuffer()),data=buffer.getChannelData(0),sr=buffer.sampleRate,duration=buffer.duration; if(!data.length) throw new Error('The recording is empty.'); let sum=0,crossings=0,previous=data[0]; const frame=Math.max(256,Math.floor(sr*.03)),energies=[];
    for(let i=0;i<data.length;i++){const sample=data[i];sum+=sample*sample;if((sample>=0&&previous<0)||(sample<0&&previous>=0))crossings++;previous=sample;if(i%frame===0){let total=0,end=Math.min(i+frame,data.length);for(let j=i;j<end;j++)total+=data[j]*data[j];energies.push(Math.sqrt(total/Math.max(1,end-i)));}}
    const rms=Math.sqrt(sum/data.length),energyDb=20*Math.log10(Math.max(rms,1e-8)),pitch=Math.max(70,Math.min(1200,(crossings/2)/Math.max(duration,.01))),sorted=[...energies].sort((a,b)=>a-b),threshold=Math.max(sorted[Math.max(0,Math.ceil(sorted.length*.7)-1)]||.001,.001); let bursts=0,active=false; energies.forEach(e=>{const on=e>threshold;if(on&&!active)bursts++;active=on;});
    let label='Uncertain / needs more context',explanation='The acoustic features do not strongly match the prototype categories.',confidence=.40;
    if(pitch>=500&&bursts>=3&&energyDb>-25){label='Excited / playful';explanation='The sound has relatively high pitch, energy and repeated bursts.';confidence=.68;} else if(pitch>=400&&energyDb<-30){label='Attention seeking / whiny';explanation='The sound is relatively high-pitched but low in energy.';confidence=.62;} else if(energyDb>-18&&pitch<350){label='Alert / intense';explanation='The recording has strong energy and a comparatively lower pitch.';confidence=.64;}
    return {label,explanation,confidence,features:{duration_seconds:+duration.toFixed(2),sample_rate:sr,estimated_pitch_hz:+pitch.toFixed(1),energy_db:+energyDb.toFixed(2),sound_bursts:bursts}};
  } finally { await ctx.close(); }
}

$('dogRecordBtn').addEventListener('click',async()=>{try{const stream=await getMicrophone();dogChunks=[];dogRecorder=new MediaRecorder(stream);dogRecorder.ondataavailable=e=>{if(e.data.size)dogChunks.push(e.data);};dogRecorder.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());const blob=new Blob(dogChunks,{type:dogRecorder.mimeType||'audio/webm'});$('dogPreview').src=URL.createObjectURL(blob);$('dogPreview').classList.remove('hidden');setRecordingUI('dogWave','dogStatus',false,'Analyzing dog sound...');$('dogResult').classList.remove('hidden');$('dogResult').innerHTML='<p><i class="bi bi-cpu-fill"></i> Listening to the dog sound...</p>';try{const form=new FormData();form.append('file',blob,'dog-recording.webm');let data;try{data=await fetchJson('/api/dog-to-human',{method:'POST',body:form});}catch(_){data=await analyzeDogAudioLocally(blob);}const message=`Your dog may be ${data.label.toLowerCase()}. ${data.explanation}`;$('dogResult').innerHTML=`<h3><i class="bi bi-chat-square-text-fill"></i> Human interpretation</h3><p>${message}</p><p><strong>Confidence:</strong> ${Math.round(data.confidence*100)}%</p><div class="stats"><div class="stat">Pitch: ${data.features.estimated_pitch_hz} Hz</div><div class="stat">Energy: ${data.features.energy_db} dB</div><div class="stat">Duration: ${data.features.duration_seconds}s</div><div class="stat">Bursts: ${data.features.sound_bursts}</div></div>`;speakHuman(message);setRecordingUI('dogWave','dogStatus',false,'Done — interpretation spoken aloud');}catch(error){$('dogResult').innerHTML=`<p><i class="bi bi-x-circle-fill"></i> ${error.message}</p>`;setRecordingUI('dogWave','dogStatus',false,'Analysis failed');}};dogRecorder.start();$('dogRecordBtn').disabled=true;$('dogStopBtn').disabled=false;setRecordingUI('dogWave','dogStatus',true,'Listening to dog... bark now');}catch(error){$('dogResult').classList.remove('hidden');$('dogResult').innerHTML=`<p><i class="bi bi-x-circle-fill"></i> ${error.message}</p>`;}});
$('dogStopBtn').addEventListener('click',()=>{if(dogRecorder&&dogRecorder.state!=='inactive')dogRecorder.stop();$('dogRecordBtn').disabled=false;$('dogStopBtn').disabled=true;});
function setupSpeechRecognition(){const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SpeechRecognition)return null;const r=new SpeechRecognition();r.continuous=true;r.interimResults=true;r.lang='en-IN';r.onresult=event=>{let text='';for(let i=event.resultIndex;i<event.results.length;i++)text+=event.results[i][0].transcript;transcript=text.trim();$('transcript').textContent=transcript||'Listening...';};r.onerror=()=>{};return r;}

$('humanRecordBtn').addEventListener('click',async()=>{try{const stream=await getMicrophone();transcript='';$('transcript').textContent='Listening to your voice...';humanRecorder=new MediaRecorder(stream);humanRecorder.ondataavailable=()=>{};humanRecorder.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());if(recognition){try{recognition.stop();}catch(_){}}$('humanResult').classList.remove('hidden');const text=transcript.trim();if(!text){$('humanResult').innerHTML='<p><i class="bi bi-x-circle-fill"></i> No speech was detected. Allow microphone access and speak clearly.</p>';setRecordingUI('humanWave','humanStatus',false,'No speech detected');return;}$('humanResult').innerHTML='<p><i class="bi bi-cpu-fill"></i> Understanding the sentence and building a BarkCode...</p>';try{let data;try{data=await fetchJson('/api/human-to-dog',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})});}catch(_){data=localHumanToDog(text);}const segments=buildBarkSegments(data,text);const labels=segments.map(s=>s.cue||s.intent).join(' → ');const patterns=segments.map(s=>(s.pattern||[]).join('-')).join('   |   ');$('humanResult').innerHTML=`<h3><i class="bi bi-soundwave"></i> BarkCode generated</h3><p><strong>Human said:</strong> ${text}</p><p><strong>Meaning detected:</strong> ${labels}</p><p><strong>Bark pattern:</strong> ${patterns}</p><p>${data.note||'Each pattern is a project-defined training cue.'}</p><button id="playCueBtn" type="button"><i class="bi bi-volume-up-fill"></i> Play Dog Vocalization</button><p><small>The playback uses a real recorded dog bark. A dog would need training to associate these repeat/pause patterns with their meanings; this is not a proven literal dog-language translator.</small></p>`;$('playCueBtn').addEventListener('click',()=>playBarkCode(segments));setRecordingUI('humanWave','humanStatus',false,'Done — BarkCode ready');}catch(error){$('humanResult').innerHTML=`<p><i class="bi bi-x-circle-fill"></i> ${error.message}</p>`;setRecordingUI('humanWave','humanStatus',false,'Conversion failed');}};humanRecorder.start();recognition=setupSpeechRecognition();if(recognition){try{recognition.start();}catch(_){} }$('humanRecordBtn').disabled=true;$('humanStopBtn').disabled=false;setRecordingUI('humanWave','humanStatus',true,'Listening to you... speak the full sentence');}catch(error){$('humanResult').classList.remove('hidden');$('humanResult').innerHTML=`<p><i class="bi bi-x-circle-fill"></i> ${error.message}</p>`;}});
$('humanStopBtn').addEventListener('click',()=>{if(humanRecorder&&humanRecorder.state!=='inactive')humanRecorder.stop();$('humanRecordBtn').disabled=false;$('humanStopBtn').disabled=true;});
