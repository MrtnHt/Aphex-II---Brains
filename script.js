(function(){
  // Elements
  const body = document.body;
  const switchBtn = document.getElementById('switchThemeBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsModal = document.getElementById('settingsModal');
  const saveKeysBtn = document.getElementById('saveKeysBtn');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  const openaiKeyInput = document.getElementById('openaiKeyInput');
  const githubKeyInput = document.getElementById('githubKeyInput');
  const chatForm = document.getElementById('chatForm');
  const messageInput = document.getElementById('messageInput');
  const messagesEl = document.getElementById('messages');

  // Chat history kept in-memory
  const conversation = [];

  // THEME HANDLING
  function getStoredTheme(){
    return localStorage.getItem('theme');
  }
  function applyTheme(theme){
    if(theme === 'theme-glass'){
      body.classList.remove('theme-matrix');
      body.classList.add('theme-glass');
    } else {
      body.classList.remove('theme-glass');
      body.classList.add('theme-matrix');
    }
    localStorage.setItem('theme', theme);
  }
  function toggleTheme(){
    const isGlass = body.classList.contains('theme-glass');
    applyTheme(isGlass ? 'theme-matrix' : 'theme-glass');
  }

  // INITIAL THEME SETUP
  (function initTheme(){
    const stored = getStoredTheme();
    if(!stored){
      // default to matrix
      applyTheme('theme-matrix');
    } else {
      applyTheme(stored);
    }
  })();

  switchBtn.addEventListener('click', ()=>{
    toggleTheme();
  });

  // SETTINGS (API KEYS)
  function openSettings(){
    // populate with stored values (masked)
    const openaiStored = localStorage.getItem('openaiKey') || '';
    const githubStored = localStorage.getItem('githubKey') || '';
    openaiKeyInput.value = openaiStored;
    githubKeyInput.value = githubStored;
    settingsModal.classList.remove('hidden');
  }
  function closeSettings(){
    settingsModal.classList.add('hidden');
  }

  settingsBtn.addEventListener('click', openSettings);
  closeSettingsBtn.addEventListener('click', closeSettings);

  saveKeysBtn.addEventListener('click', ()=>{
    const openaiVal = openaiKeyInput.value.trim();
    const githubVal = githubKeyInput.value.trim();
    if(openaiVal){
      localStorage.setItem('openaiKey', openaiVal);
    } else {
      localStorage.removeItem('openaiKey');
    }
    if(githubVal){
      localStorage.setItem('githubKey', githubVal);
    } else {
      localStorage.removeItem('githubKey');
    }
    closeSettings();
  });

  // If no keys, prompt user
  (function ensureKeys(){
    const key = localStorage.getItem('openaiKey');
    if(!key){
      // small delay to let UI render
      setTimeout(openSettings, 300);
    }
  })();

  // Utilities: create message element
  function createMessageEl(text, role){
    const el = document.createElement('div');
    el.className = 'message ' + (role === 'user' ? 'user' : 'assistant');
    el.setAttribute('data-role', role);
    return el;
  }

  // Typewriter effect for matrix mode
  function typeWriter(text, container, speed = 18){
    return new Promise((resolve)=>{
      let i = 0;
      const caret = document.createElement('span');
      caret.className = 'type-caret';
      container.appendChild(caret);
      const interval = setInterval(()=>{
        if(i < text.length){
          // insert before caret
          caret.insertAdjacentText('beforebegin', text.charAt(i));
          i++;
          messagesEl.scrollTop = messagesEl.scrollHeight;
        } else {
          clearInterval(interval);
          caret.remove();
          resolve();
        }
      }, speed);
    });
  }

  // Display assistant text, considering theme
  async function displayAssistantText(text){
    const el = createMessageEl('', 'assistant');
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    if(body.classList.contains('theme-matrix')){
      // typewriter
      await typeWriter(text, el, 14);
    } else {
      el.textContent = text;
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  }

  // Send to OpenAI Chat Completion
  async function sendToOpenAI(userMessage){
    const key = localStorage.getItem('openaiKey');
    if(!key){
      openSettings();
      return displayAssistantText('OpenAI API key ontbreekt. Open settings om de key toe te voegen.');
    }

    // show placeholder assistant message while waiting
    const thinkingEl = createMessageEl('...', 'assistant');
    messagesEl.appendChild(thinkingEl);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    // build messages payload with recent conversation (simple)
    const payloadMessages = [];
    // optional system prompt for consistent behaviour
    payloadMessages.push({role:'system', content:'Je bent een behulpzame assistent.'});
    for(const m of conversation){
      payloadMessages.push({role:m.role, content:m.content});
    }
    payloadMessages.push({role:'user', content:userMessage});

    try{
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + key
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: payloadMessages,
          max_tokens: 600,
          temperature: 0.7
        })
      });

      if(!resp.ok){
        const errorText = await resp.text();
        thinkingEl.remove();
        return displayAssistantText('API fout: ' + resp.status + ' - ' + errorText);
      }

      const data = await resp.json();
      const content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) ? data.choices[0].message.content.trim() : 'Geen antwoord ontvangen.';

      // update conversation
      conversation.push({role:'user', content: userMessage});
      conversation.push({role:'assistant', content: content});

      // remove thinking placeholder
      thinkingEl.remove();

      await displayAssistantText(content);
    } catch(err){
      thinkingEl.remove();
      displayAssistantText('Netwerkfout of CORS fout: ' + (err && err.message ? err.message : String(err)));
    }
  }

  // Chat form handler
  chatForm.addEventListener('submit', (e)=>{
    e.preventDefault();
    const text = messageInput.value.trim();
    if(!text) return;
    // append user message
    const userEl = createMessageEl(text, 'user');
    userEl.textContent = text;
    messagesEl.appendChild(userEl);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    messageInput.value = '';
    // call OpenAI
    sendToOpenAI(text);
  });

  // Allow pressing Escape to close settings modal
  document.addEventListener('keydown', (e)=>{
    if(e.key === 'Escape'){
      if(!settingsModal.classList.contains('hidden')){
        closeSettings();
      }
    }
  });

  // expose minimal debug on window for dev usage
  window.__hybridUI = {
    applyTheme, toggleTheme, openSettings, closeSettings, conversation
  };
})();
