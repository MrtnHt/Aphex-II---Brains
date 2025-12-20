(function(){
  // Keys for localStorage
  const STORAGE = {
    SETTINGS: 'mb_settings_v1',
    CHAT: 'mb_chat_v1'
  };

  // State
  let state = {
    settings: {
      openaiKey: '',
      githubToken: '',
      model: 'gpt-4o',
      customModel: '',
      systemInstructions: '',
      theme: 'theme-glass'
    },
    chat: []
  };

  let currentController = null;

  // Elements
  const el = {
    chat: null,
    userInput: null,
    sendBtn: null,
    stopBtn: null,
    themeBtn: null,
    clearBtn: null,
    configBtn: null,
    settingsModal: null,
    openaiKey: null,
    githubToken: null,
    modelSelect: null,
    customModelWrap: null,
    customModel: null,
    systemInstructions: null,
    saveSettings: null,
    closeSettings: null,
    appTitle: null,
    appStatus: null
  };

  // Helpers
  function $(id){ return document.getElementById(id); }
  function saveState(){
    localStorage.setItem(STORAGE.SETTINGS, JSON.stringify(state.settings));
    localStorage.setItem(STORAGE.CHAT, JSON.stringify(state.chat));
  }
  function loadState(){
    try{
      const s = JSON.parse(localStorage.getItem(STORAGE.SETTINGS) || '{}');
      state.settings = Object.assign(state.settings, s);
    }catch(e){}
    try{
      const c = JSON.parse(localStorage.getItem(STORAGE.CHAT) || '[]');
      state.chat = Array.isArray(c) ? c : [];
    }catch(e){state.chat = []}
  }

  function escapeHtml(text){
    return text
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#039;');
  }

  function renderChat(){
    const container = el.chat;
    if(!container) return;
    const wasAtBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 120;
    container.innerHTML = '';
    state.chat.forEach(m => {
      const msg = document.createElement('div');
      msg.className = 'message ' + (m.role === 'user' ? 'user' : (m.role === 'assistant' ? 'assistant' : 'system'));
      // Simple markdown codeblock handling: ``` blocks -> <pre>
      let content = escapeHtml(m.content || '');
      // convert triple backtick blocks
      content = content.replace(/```([\s\S]*?)```/g, function(_, code){
        return '<pre>' + escapeHtml(code) + '</pre>'; // pre will be safe
      });
      // convert single line breaks
      content = content.replace(/\n/g, '<br>');
      msg.innerHTML = content;
      container.appendChild(msg);
    });
    if(wasAtBottom) container.scrollTop = container.scrollHeight;
  }

  function pushMessage(role, content){
    const msg = {role, content: content || '', ts: Date.now()};
    state.chat.push(msg);
    saveState();
    renderChat();
  }

  function applySettingsToUI(){
    document.body.classList.remove('theme-glass','theme-matrix');
    document.body.classList.add(state.settings.theme || 'theme-glass');
    if(el.openaiKey) el.openaiKey.value = state.settings.openaiKey || '';
    if(el.githubToken) el.githubToken.value = state.settings.githubToken || '';
    if(el.modelSelect) el.modelSelect.value = state.settings.model || 'gpt-4o';
    if(el.customModel) el.customModel.value = state.settings.customModel || '';
    if(el.systemInstructions) el.systemInstructions.value = state.settings.systemInstructions || '';
    toggleCustomField(state.settings.model === 'custom');
  }

  function toggleCustomField(show){
    if(el.customModelWrap) el.customModelWrap.classList.toggle('hidden', !show);
  }

  function openModal(){ el.settingsModal.classList.remove('hidden'); }
  function closeModal(){ el.settingsModal.classList.add('hidden'); }

  async function sendToOpenAI(){
    const key = state.settings.openaiKey;
    if(!key){
      alert('OpenAI API key ontbreekt — zet hem in Instellingen');
      return;
    }

    // Build messages: include system instructions as first message
    const system = (state.settings.systemInstructions || '').trim();
    const apiMessages = [];
    if(system) apiMessages.push({role: 'system', content: system});
    // include full chat history (we only include user/assistant roles)
    state.chat.forEach(m => {
      if(m.role === 'system') return;
      apiMessages.push({role: m.role, content: m.content});
    });

    const modelParam = (state.settings.model === 'custom' && state.settings.customModel) ? state.settings.customModel : state.settings.model;

    // show status and stop btn
    el.appStatus.textContent = '— Generating...';
    el.stopBtn.classList.remove('hidden');

    // create controller
    currentController = new AbortController();
    try{
      const resp = await fetch('https://api.openai.com/v1/chat/completions',{
        method: 'POST',
        headers: {
          'Content-Type':'application/json',
          'Authorization':'Bearer ' + key
        },
        body: JSON.stringify({ model: modelParam, messages: apiMessages, max_tokens: 1500 }),
        signal: currentController.signal
      });

      if(!resp.ok){
        const errText = await resp.text();
        pushMessage('assistant','[Error] API returned ' + resp.status + '\n' + errText);
        return;
      }

      const data = await resp.json();
      const assistantMsg = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) ? data.choices[0].message.content : '[Geen antwoord]';
      pushMessage('assistant', assistantMsg);

    }catch(e){
      if(e.name === 'AbortError'){
        pushMessage('assistant','[Generatie gestopt door gebruiker]');
      }else{
        pushMessage('assistant','[Error] ' + (e.message || 'Onbekende fout'));
      }
    }finally{
      currentController = null;
      el.stopBtn.classList.add('hidden');
      el.appStatus.textContent = '— Ready';
      saveState();
    }
  }

  // Public actions
  function onSend(){
    const text = (el.userInput.value || '').trim();
    if(!text) return;
    pushMessage('user', text);
    el.userInput.value = '';
    adjustTextareaHeight();
    // start the API call
    sendToOpenAI();
  }

  function onStop(){
    if(currentController){
      currentController.abort();
    }
    el.stopBtn.classList.add('hidden');
  }

  function onClear(){
    if(!confirm('Weet je het zeker? Alles wordt gewist.')) return;
    state.chat = [];
    saveState();
    renderChat();
  }

  function cycleTheme(){
    const t = state.settings.theme === 'theme-glass' ? 'theme-matrix' : 'theme-glass';
    state.settings.theme = t;
    applySettingsToUI();
    saveState();
  }

  function adjustTextareaHeight(){
    const ta = el.userInput;
    if(!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(160, ta.scrollHeight) + 'px';
  }

  function init(){
    // bind elements
    el.chat = $('chat');
    el.userInput = $('user-input');
    el.sendBtn = $('send-btn');
    el.stopBtn = $('stop-btn');
    el.themeBtn = $('theme-btn');
    el.clearBtn = $('clear-btn');
    el.configBtn = $('config-btn');
    el.settingsModal = $('settings-modal');
    el.openaiKey = $('openai-key');
    el.githubToken = $('github-token');
    el.modelSelect = $('model-select');
    el.customModelWrap = $('custom-model-wrap');
    el.customModel = $('custom-model');
    el.systemInstructions = $('system-instructions');
    el.saveSettings = $('save-settings');
    el.closeSettings = $('close-settings');
    el.appTitle = $('app-title');
    el.appStatus = $('app-status');

    // load
    loadState();
    applySettingsToUI();
    renderChat();

    // events
    el.sendBtn.addEventListener('click', onSend);
    el.stopBtn.addEventListener('click', onStop);
    el.themeBtn.addEventListener('click', cycleTheme);
    el.clearBtn.addEventListener('click', onClear);
    el.configBtn.addEventListener('click', openModal);
    el.closeSettings.addEventListener('click', closeModal);

    el.saveSettings.addEventListener('click', function(){
      state.settings.openaiKey = el.openaiKey.value.trim();
      state.settings.githubToken = el.githubToken.value.trim();
      state.settings.model = el.modelSelect.value;
      state.settings.customModel = el.customModel.value.trim();
      state.settings.systemInstructions = el.systemInstructions.value;
      state.settings.theme = document.body.classList.contains('theme-matrix') ? 'theme-matrix' : (state.settings.theme || 'theme-glass');
      saveState();
      applySettingsToUI();
      closeModal();
    });

    el.modelSelect.addEventListener('change', function(){
      toggleCustomField(el.modelSelect.value === 'custom');
    });

    // input keyboard
    el.userInput.addEventListener('keydown', function(e){
      if(e.key === 'Enter' && !e.shiftKey){
        e.preventDefault();
        onSend();
      }
    });

    el.userInput.addEventListener('input', function(){ adjustTextareaHeight(); });
    window.addEventListener('resize', function(){ adjustTextareaHeight(); });

    // scroll locking behavior: if user scrolls up, stop auto-scroll until they scroll back down near bottom
    let userScrolledUp = false;
    el.chat.addEventListener('scroll', function(){
      const c = el.chat;
      userScrolledUp = (c.scrollTop + c.clientHeight) < (c.scrollHeight - 120);
    });

    // override pushMessage to consider auto-scroll only if user not scrolled up
    const originalPush = pushMessage;
    pushMessage = function(role, content){
      originalPush(role, content);
      // after render, only auto scroll if user is not scrolled up
      if(!userScrolledUp){ el.chat.scrollTop = el.chat.scrollHeight; }
    };

    // make sure everything has been applied
    applySettingsToUI();
    renderChat();
  }

  // start
  document.addEventListener('DOMContentLoaded', init);
})();