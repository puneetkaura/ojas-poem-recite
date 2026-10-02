const poemSelect = document.querySelector('#poemSelect');
const libraryCount = document.querySelector('#libraryCount');
const libraryNote = document.querySelector('#libraryNote');
const readerAudio = document.querySelector('#readerAudio');
const readingTitle = document.querySelector('#readingTitle');
const readingAuthor = document.querySelector('#readingAuthor');
const readLineCount = document.querySelector('#readLineCount');
const readProgress = document.querySelector('#readProgress');
const readLyricsWindow = document.querySelector('#readLyricsWindow');
const readCurrentLabel = document.querySelector('#readCurrentLabel');
const titleInput = document.querySelector('#titleInput');
const voiceSelect = document.querySelector('#voiceSelect');
const prepLanguage = document.querySelector('#prepLanguage');
const lyricsInput = document.querySelector('#lyricsInput');
const generateAudio = document.querySelector('#generateAudio');
const prepStatus = document.querySelector('#prepStatus');
const timingDesk = document.querySelector('#timingDesk');
const prepAudio = document.querySelector('#prepAudio');
const downloadJson = document.querySelector('#downloadJson');
const timingProgress = document.querySelector('#timingProgress');
const cueList = document.querySelector('#cueList');

let poems = [];
let readerCues = [];
let preparedCues = [];
let generatedPoem = null;
let activeReaderCue = -1;
let activePreparedCue = -1;

const formatTime = (seconds) => {
  if (!Number.isFinite(seconds)) return '—';
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
};

const linesFromText = (text) => text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

function setStatus(message, tone = '') {
  prepStatus.textContent = message;
  prepStatus.dataset.tone = tone;
}

function renderLyricLines(container, cues, activeIndex, mode) {
  container.replaceChildren();
  if (!cues.length) {
    container.innerHTML = '<div class="empty-reading"><span class="empty-spark">✦</span><p>Prepared lyrics will appear here.</p></div>';
    return;
  }
  cues.forEach((cue, index) => {
    const line = document.createElement('div');
    line.className = 'lyric-line';
    line.textContent = cue.text;
    line.dataset.index = index;
    if (index < activeIndex) line.classList.add('is-past');
    if (index === activeIndex) line.classList.add('is-active');
    container.append(line);
  });
  if (activeIndex >= 0) container.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (mode === 'read') readCurrentLabel.textContent = activeIndex >= 0 ? `Line ${activeIndex + 1} of ${cues.length}` : 'Ready when you are';
}

function cueAtTime(cues, time) {
  if (!cues.length) return -1;
  const found = cues.findIndex((cue) => time >= cue.start && time < cue.end);
  return found >= 0 ? found : time >= cues[cues.length - 1].start ? cues.length - 1 : -1;
}

function syncReader() {
  const index = cueAtTime(readerCues, readerAudio.currentTime);
  if (index !== activeReaderCue) {
    activeReaderCue = index;
    renderLyricLines(readLyricsWindow, readerCues, index, 'read');
  }
  readProgress.style.width = readerAudio.duration ? `${(readerAudio.currentTime / readerAudio.duration) * 100}%` : '0%';
}

function loadPoem(poem) {
  readerCues = poem.cues || [];
  activeReaderCue = -1;
  readingTitle.textContent = poem.title;
  readingAuthor.textContent = poem.author || '';
  readLineCount.textContent = `${readerCues.length} ${readerCues.length === 1 ? 'line' : 'lines'}`;
  readerAudio.src = poem.audio || '';
  readerAudio.load();
  renderLyricLines(readLyricsWindow, readerCues, -1, 'read');
  readProgress.style.width = '0%';
  readCurrentLabel.textContent = poem.audio ? 'Ready when you are' : 'Audio file not attached yet';
  libraryNote.innerHTML = poem.audio ? `Playing <code>${poem.audio}</code>` : 'This poem has timing data but no audio path yet.';
}

async function loadLibrary() {
  try {
    const response = await fetch('/poems.json', { cache: 'no-store' });
    const data = await response.json();
    poems = Array.isArray(data) ? data : data.poems || [];
  } catch {
    poems = [];
  }
  poemSelect.replaceChildren();
  libraryCount.textContent = `${poems.length} ${poems.length === 1 ? 'poem' : 'poems'}`;
  if (!poems.length) {
    poemSelect.add(new Option('No prepared poems yet', ''));
    readingTitle.textContent = 'Your poem library is ready';
    return;
  }
  poems.forEach((poem) => poemSelect.add(new Option(`${poem.title} · ${poem.language || 'poem'}`, poem.id)));
  const requestedId = new URLSearchParams(location.search).get('poem');
  const selected = poems.find((poem) => poem.id === requestedId) || poems[0];
  poemSelect.value = selected.id;
  loadPoem(selected);
}

function updatePreparedCueDisplay() {
  timingProgress.textContent = `${preparedCues.length} ${preparedCues.length === 1 ? 'line' : 'lines'} synced`;
  cueList.replaceChildren();
  preparedCues.forEach((cue, index) => {
    const row = document.createElement('div');
    row.className = `cue-row${index === activePreparedCue ? ' is-active' : ''}`;
    const number = document.createElement('span');
    number.className = 'cue-number';
    number.textContent = String(index + 1).padStart(2, '0');
    const text = document.createElement('span');
    text.className = 'cue-text';
    text.textContent = cue.text;
    const time = document.createElement('span');
    time.className = 'cue-time';
    time.textContent = `${formatTime(cue.start)} — ${formatTime(cue.end)}`;
    row.append(number, text, time);
    cueList.append(row);
  });
}

function syncPrepared() {
  const index = cueAtTime(preparedCues, prepAudio.currentTime);
  if (index === activePreparedCue) return;
  activePreparedCue = index;
  updatePreparedCueDisplay();
}

async function createAudioAndTimings() {
  const title = titleInput.value.trim();
  const lines = linesFromText(lyricsInput.value);
  if (!title) return setStatus('Give the poem a title first.', 'error');
  if (!lines.length) return setStatus('Paste the poem, keeping one spoken line per row.', 'error');

  generateAudio.disabled = true;
  downloadJson.disabled = true;
  setStatus('Preparing the local Indian voice, one line at a time…');
  try {
    const response = await fetch('/api/generate-audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, language: prepLanguage.value, voice: voiceSelect.value, lines }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Audio generation failed.');
    generatedPoem = result;
    preparedCues = result.cues;
    activePreparedCue = -1;
    prepAudio.src = `/${result.audio}`;
    prepAudio.load();
    timingDesk.classList.remove('is-hidden');
    downloadJson.disabled = false;
    updatePreparedCueDisplay();
    setStatus(`Created ${result.audio}. The subtitle timings are ready to preview.`);
    timingDesk.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Audio generation failed.', 'error');
  } finally {
    generateAudio.disabled = false;
  }
}

function downloadPreparedJson() {
  if (!generatedPoem) return;
  const payload = { id: generatedPoem.id, title: generatedPoem.title, language: generatedPoem.language, audio: generatedPoem.audio, cues: generatedPoem.cues };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${generatedPoem.id}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  setStatus(`Downloaded ${generatedPoem.id}.json. Add this object to public/poems.json before deploying.`);
}

document.querySelectorAll('.mode-tab').forEach((tab) => tab.addEventListener('click', () => {
  document.querySelectorAll('.mode-tab').forEach((item) => item.classList.toggle('is-active', item === tab));
  document.querySelectorAll('.mode-panel').forEach((panel) => panel.classList.toggle('is-active', panel.dataset.panel === tab.dataset.mode));
}));

poemSelect.addEventListener('change', () => {
  const poem = poems.find((item) => item.id === poemSelect.value);
  if (poem) { history.replaceState(null, '', `?poem=${encodeURIComponent(poem.id)}`); loadPoem(poem); }
});
readerAudio.addEventListener('timeupdate', syncReader);
readerAudio.addEventListener('ended', () => { activeReaderCue = -1; readProgress.style.width = '100%'; readCurrentLabel.textContent = 'Poem complete'; });
prepAudio.addEventListener('timeupdate', syncPrepared);
generateAudio.addEventListener('click', createAudioAndTimings);
downloadJson.addEventListener('click', downloadPreparedJson);
document.addEventListener('keydown', (event) => {
  if (event.code === 'Space' && event.target.tagName !== 'TEXTAREA' && event.target.tagName !== 'INPUT' && event.target.tagName !== 'SELECT') {
    event.preventDefault();
    const audio = document.querySelector('#readMode').classList.contains('is-active') ? readerAudio : prepAudio;
    audio.paused ? audio.play() : audio.pause();
  }
});

loadLibrary();
