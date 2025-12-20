'use strict';

// ===== State =====
const STORAGE_KEYS = {
  settings: 'aphex_settings',
  history: 'aphex_history',
  cost: 'aphex_cost'
};

const DEFAULT_SETTINGS = {
  openaiKey: '',
  githubToken: '',
  tavilyKey: '',
  model: 'gpt-5',
  customModel: '',
  persona: 'You are Aphex II AutoGPT. Be concise, reliable, and actionable. Use web context when provided. Answer in the user\'s language.',
  theme: 'theme-glass',
  webSearchEnabled: false
};

let settings = loadSettings();
let chatHistory = loadHistory();
let costTotals = loadCost();
let busy = false;
let abortController = null;

// ===== Elements =====
const body = document.body;
const chatEl = document.getElementById('chat');
const promptInput = document.getElementById('promptInput');
const btnSend = document.getElementById('btnSend');
const btnStop = document.getElementById('btnStop');
const btnDownload = document.getElementById('btnDownload');
const btnTheme = document.getElementById('btnTheme');
const btnSettings = document.getElementById('btnSettings');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const costLabel = document.getElementById('costLabel');
const webToggle = document.getElementById('webToggle');

// Modal elements
const modal = document.getElementById('settingsModal');
const modelSelect = document.getElementById('modelSelect');
const customModelWrap = document.getElementById('customModelWrap');
const customModel = document.getElementById('customModel');
const openaiKey = document.getElementById('openaiKey');
const githubToken = document.getElementById('githubToken');
const tavilyKey = document.getElementById('tavilyKey');
const persona = document.getElementById('persona');
const btnSave = document.getElementById('btnSave');
const btnFactoryReset = document.getElementById('btnFactoryReset');

// ===== Init =====
applyTheme(settings.theme);
renderHistory();
updateCostLabel();
webToggle.checked = !!settings.webSearchEnabled;
updateStatus();

// Auto-grow textarea
promptInput.addEventListener('input', autoGrow);
promptInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendHandler();
  }
});

btnSend.addEventListener('click', sendHandler);
btnStop.addEventListener('click', stopHandler);
btnDownload.addEventListener('click', downloadChat);
btnTheme.addEventListener('click', toggleTheme);
btnSettings.addEventListener('click', openSettings);
webToggle.addEventListener('change', () => {
  settings.webSearchEnabled = webToggle.checked;
  saveSettings(false);
});

// Settings modal
modelSelect.addEventListener('change', () => {
  customModelWrap.style.display = modelSelect.value === 'custom' ? 'block' : 'none';
});
btnSave.addEventListener('click', () => {
  // Force Save: no validation
  settings.openaiKey = openaiKey.value || '';
  settings.githubToken = githubToken.value || '';
  settings.tavilyKey = tavilyKey.value || '';
  settings.model = modelSelect.value;
  settings.customModel = customModel.value || '';
  settings.persona = persona.value || '';
  saveSettings(true); // force reload
});
btnFactoryReset.addEventListener('click', () => {
  const ok = confirm('Factory Reset uitvoeren? Alle instellingen, kosten en chatgeschiedenis worden verwijderd.');
  if (!ok) return;
  localStorage.removeItem(STORAGE_KEYS.settings);
  localStorage.removeItem(STORAGE_KEYS.history);
  localStorage.removeItem(STORAGE_KEYS.cost);
  location.reload();
});

function openSettings() {
  // populate
  openaiKey.value = settings.openaiKey;
  githubToken.value = settings.githubToken;
  tavilyKey.value = settings.tavilyKey;
  modelSelect.value = settings.model;
  customModel.value = settings.customModel || '';
  customModelWrap.style.display = modelSelect.value === 'custom' ? 'block' : 'none';
  persona.value = settings.persona || '';
  if (typeof modal.showModal === 'function') modal.showModal();
  else modal.setAttribute('open', 'open');
}

// ===== Handlers =====
async function sendHandler() {
  if (busy) return;
  const text = (promptInput.value || '').trim();
  if (!text) return;

  // Push user message
  const userMsg = { role: 'user', content: text, ts: Date.now() };
  appendMessage(userMsg);
  promptInput.value = '';
  autoGrow();

  try {
    setBusy(true);

    // Optional web search
    let contextMsg = null;
    if (settings.webSearchEnabled && settings.tavilyKey) {
      try {
        updateStatus('Zoeken...');
        const ctx = await webSearch(text, settings.tavilyKey);
        if (ctx) {
          contextMsg = { role: 'system', content: ctx, ts: Date.now(), context: true };
          appendMessage(contextMsg); // show context to user as trace
        }
      } catch (err) {
        console.warn('Web search failed:', err);
        appendMessage({ role: 'system', content: 'Web Search fout of geen resultaten. Ga verder zonder webcontext.', ts: Date.now() });
      }
    }

    // Compose messages for OpenAI
    const messages = buildMessagesForOpenAI(chatHistory, settings.persona, contextMsg);

    // Estimate prompt tokens for cost
    const promptTokens = estimatePromptTokens(messages);

    updateStatus('Denken...');
    const { text: completion, finish_reason } = await callOpenAI(messages);

    const assistantMsg = { role: 'assistant', content: completion || '(geen antwoord)', ts: Date.now(), meta: { finish_reason } };
    appendMessage(assistantMsg);

    // Cost accounting
    const completionTokens = countTokens(completion || '');
    addCost(promptTokens, completionTokens);

  } catch (err) {
    if (err && err.name === 'AbortError') {
      appendMessage({ role: 'system', content: 'Generatie gestopt door gebruiker.', ts: Date.now() });
    } else {
      console.error(err);
      appendMessage({ role: 'system', content: 'Fout: ' + (err?.message || err), ts: Date.now() });
    }
  } finally {
    setBusy(false);
    updateStatus('Ready');
  }
}

function stopHandler() {
  if (abortController) {
    abortController.abort();
  }
}

function downloadChat() {
  const lines = chatHistory.map(m => {
    const time = new Date(m.ts || Date.now()).toISOString();
    const role = (m.context ? 'context' : m.role);
    return `[${time}] ${role.toUpperCase()}\n${m.content}\n`;
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const ts = new Date();
  const pad = n => String(n).padStart(2, '0');
  const name = `aphex-chat-${ts.getFullYear()}${pad(ts.getMonth()+1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}.txt`;
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function toggleTheme() {
  const next = (settings.theme === 'theme-glass') ? 'theme-matrix' : 'theme-glass';
  settings.theme = next;
  applyTheme(next);
  saveSettings(false);
}

function applyTheme(theme) {
  body.classList.remove('theme-glass', 'theme-matrix');
  body.classList.add(theme);
}

function setBusy(b) {
  busy = b;
  btnSend.disabled = b;
  btnStop.style.display = b ? 'inline-block' : 'none';
  statusDot.style.background = b ? '#facc15' : 'var(--success)';
  statusDot.style.boxShadow = b ? '0 0 6px #facc15' : '0 0 6px var(--success)';
}

function updateStatus(text = 'Ready') {
  statusText.textContent = text;
  const ok = !!settings.openaiKey;
  statusDot.style.opacity = ok ? 1 : 0.6;
}

// ===== OpenAI =====
async function callOpenAI(messages) {
  if (!settings.openaiKey) throw new Error('Geen OpenAI API Key ingesteld. Open de Instellingen (⚙️).');

  const model = settings.model === 'custom' && settings.customModel ? settings.customModel : settings.model;
  const url = 'https://api.openai.com/v1/chat/completions';

  abortController = new AbortController();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.openaiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      stream: false
    }),
    signal: abortController.signal
  });

  if (!res.ok) {
    const txt = await safeText(res);
    throw new Error(`OpenAI fout ${res.status}: ${txt}`);
  }

  const data = await res.json();
  const choice = data.choices && data.choices[0];
  return { text: choice?.message?.content || '', finish_reason: choice?.finish_reason || '' };
}

// ===== Tavily Web Search =====
async function webSearch(query, apiKey) {
  const url = 'https://api.tavily.com/search';
  const payload = {
    api_key: apiKey,
    query,
    search_depth: 'basic',
    include_answer: true,
    max_results: 5
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`Tavily fout ${res.status}`);
  const data = await res.json();
  // Build compact context
  const lines = [];
  if (data.answer) lines.push(`Answer: ${data.answer}`);
  if (Array.isArray(data.results)) {
    data.results.slice(0, 5).forEach((r, i) => {
      const title = r.title || r.url || `Result ${i+1}`;
      const snippet = r.content || r.snippet || '';
      lines.push(`- ${title}\n  ${snippet}\n  ${r.url || ''}`);
    });
  }
  const context = `WEB CONTEXT (via Tavily)\nQuery: ${query}\n${lines.join('\n')}`;
  return context;
}

function buildMessagesForOpenAI(history, personaText, contextMsg) {
  const messages = [];
  if (personaText && personaText.trim()) {
    messages.push({ role: 'system', content: personaText.trim() });
  }
  if (contextMsg && contextMsg.content) {
    messages.push({ role: 'system', content: contextMsg.content });
  }
  // Include last 12 turns to keep prompt small
  const max = 24; // messages
  const recent = history.slice(-max).filter(m => m.role === 'user' || m.role === 'assistant');
  for (const m of recent) {
    messages.push({ role: m.role, content: m.content });
  }
  // Ensure last item is the latest user message (already appended before call)
  return messages;
}

// ===== Cost Estimation =====
// 1 word ~= 1.3 tokens
function countTokens(text) {
  if (!text) return 0;
  const words = (text.trim().match(/\S+/g) || []).length;
  return Math.ceil(words * 1.3);
}

function estimatePromptTokens(messages) {
  let sum = 0;
  for (const m of messages) sum += countTokens(m.content || '');
  return sum;
}

const RATES = {
  // USD per 1M tokens (estimates)
  'gpt-5': { input: 10, output: 30 },
  'gpt-5-mini': { input: 1, output: 3 },
  'gpt-4o': { input: 5, output: 15 },
  'o1-preview': { input: 15, output: 60 },
  'default': { input: 10, output: 30 }
};

function addCost(promptTokens, completionTokens) {
  const model = settings.model === 'custom' ? 'default' : settings.model;
  const rate = RATES[model] || RATES.default;
  const costIn = (promptTokens / 1_000_000) * rate.input;
  const costOut = (completionTokens / 1_000_000) * rate.output;
  costTotals.prompt += promptTokens;
  costTotals.completion += completionTokens;
  costTotals.usd += (costIn + costOut);
  saveCost();
  updateCostLabel();
}

function updateCostLabel() {
  costLabel.textContent = `Est. Cost: $${(costTotals.usd || 0).toFixed(2)}`;
}

// ===== History / Rendering =====
function appendMessage(msg) {
  chatHistory.push(msg);
  saveHistory();
  renderMessage(msg);
  scrollToBottom();
}

function renderHistory() {
  chatEl.innerHTML = '';
  chatHistory.forEach(renderMessage);
  scrollToBottom();
}

function renderMessage(m) {
  const el = document.createElement('article');
  el.className = `message ${m.context ? 'context' : m.role}`;
  const who = m.context ? 'Context' : (m.role === 'assistant' ? 'Assistant' : (m.role === 'user' ? 'Jij' : 'Systeem'));
  const time = new Date(m.ts || Date.now()).toLocaleString();
  el.innerHTML = `<header><strong>${who}</strong><span>·</span><span>${time}</span></header><div class="content"></div>`;
  const content = el.querySelector('.content');
  content.appendChild(renderMarkdownSafe(m.content || ''));
  chatEl.appendChild(el);
}

function renderMarkdownSafe(text) {
  // Minimal markdown-ish rendering: code fences and inline code
  const pre = document.createElement('div');
  const escaped = (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  // code fences
  const parts = escaped.split(/```/);
  if (parts.length > 1) {
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 1) {
        const code = document.createElement('pre');
        code.textContent = parts[i];
        pre.appendChild(code);
      } else {
        const p = document.createElement('p');
        p.innerHTML = parts[i].replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br>');
        pre.appendChild(p);
      }
    }
  } else {
    const p = document.createElement('p');
    p.innerHTML = escaped.replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br>');
    pre.appendChild(p);
  }
  return pre;
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  });
}

function autoGrow() {
  promptInput.style.height = 'auto';
  const max = window.innerHeight * 0.4;
  promptInput.style.height = Math.min(promptInput.scrollHeight, max) + 'px';
}

// ===== Storage =====
function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEYS.settings) || '{}');
    return { ...DEFAULT_SETTINGS, ...s };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
function saveSettings(forceReload) {
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
  if (forceReload) location.reload();
}

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.history) || '[]');
  } catch { return []; }
}
function saveHistory() {
  localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(chatHistory));
}

function loadCost() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.cost) || '{"prompt":0,"completion":0,"usd":0}');
  } catch { return { prompt: 0, completion: 0, usd: 0 }; }
}
function saveCost() {
  localStorage.setItem(STORAGE_KEYS.cost, JSON.stringify(costTotals));
}

// ===== Utils =====
async function safeText(res) {
  try { return await res.text(); } catch { return ''; }
}
