// Basis UI en instellingenbeheer
(function () {
  // DOM elementen
  const openSettingsBtn = document.getElementById('openSettingsBtn');
  const settingsModal = document.getElementById('settingsModal');
  const modalBackdrop = document.getElementById('modalBackdrop');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
  const openaiKeyInput = document.getElementById('openaiKey');
  const githubTokenInput = document.getElementById('githubToken');

  const messagesEl = document.getElementById('messages');
  const composer = document.getElementById('composer');
  const messageInput = document.getElementById('messageInput');

  // Toggle settings modal
  function toggleSettingsModal(open) {
    if (open) {
      settingsModal.setAttribute('aria-hidden', 'false');
      settingsModal.classList.add('open');
      // load current values
      openaiKeyInput.value = localStorage.getItem('openaiKey') || '';
      githubTokenInput.value = localStorage.getItem('githubToken') || '';
      setTimeout(() => openaiKeyInput.focus(), 150);
    } else {
      settingsModal.setAttribute('aria-hidden', 'true');
      settingsModal.classList.remove('open');
    }
  }

  // CRUCIALE FIX: saveSettings must NOT test connections or ping any API.
  function saveSettings() {
    const openaiKey = openaiKeyInput.value.trim();
    const githubToken = githubTokenInput.value.trim();

    // Direct opslaan in localStorage zonder testen/verificatie
    localStorage.setItem('openaiKey', openaiKey);
    localStorage.setItem('githubToken', githubToken);

    toggleSettingsModal(false);

    // eenvoudige feedback
    try {
      alert('Instellingen opgeslagen');
    } catch (e) {
      console.log('Instellingen opgeslagen');
    }
  }

  // append message helper
  function appendMessage(role, text) {
    const m = document.createElement('div');
    m.className = 'message ' + (role === 'user' ? 'user' : 'assistant');
    m.textContent = text;
    messagesEl.appendChild(m);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // Functie om berichten te versturen en antwoord af te handelen
  async function sendMessage(text) {
    if (!text || !text.trim()) return;
    appendMessage('user', text.trim());

    // Prepare request (kan aangepast worden aan backend/proxy)
    const openaiKey = localStorage.getItem('openaiKey') || '';

    // Simple UI hint for pending
    appendMessage('assistant', '…');
    const last = messagesEl.querySelector('.message.assistant:last-child');

    try {
      // Deze URL is een placeholder. In productie verander naar uw eigen proxy of OpenAI endpoint.
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': openaiKey ? 'Bearer ' + openaiKey : ''
        },
        body: JSON.stringify({ message: text })
      });

      // Specifieke handling voor 401
      if (resp.status === 401) {
        // Verwijder de "…”" placeholder en toon duidelijke fout in chat
        if (last) last.remove();
        appendMessage('assistant', '⚠️ Fout: API Key onjuist. Check instellingen.');
        return;
      }

      if (!resp.ok) {
        // andere fouten
        const errText = await resp.text().catch(() => resp.statusText || 'Onbekende fout');
        if (last) last.remove();
        appendMessage('assistant', '❗ Fout bij verzenden: ' + errText);
        return;
      }

      // parse en toon antwoord
      const data = await resp.json().catch(() => null);
      const reply = data && (data.reply || data.choices?.[0]?.message?.content) ? (data.reply || data.choices[0].message.content) : 'Geen antwoord ontvangen.';
      if (last) last.remove();
      appendMessage('assistant', reply);
    } catch (err) {
      if (last) last.remove();
      appendMessage('assistant', '❗ Netwerkfout: ' + (err.message || String(err)));
    }
  }

  // Events
  openSettingsBtn.addEventListener('click', () => toggleSettingsModal(true));
  modalBackdrop.addEventListener('click', () => toggleSettingsModal(false));
  cancelSettingsBtn.addEventListener('click', () => toggleSettingsModal(false));
  saveSettingsBtn.addEventListener('click', (e) => {
    e.preventDefault();
    saveSettings();
  });

  composer.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = messageInput.value;
    messageInput.value = '';
    sendMessage(v);
  });

  // Init: laad instellingen (zonder te pingen)
  (function init() {
    openaiKeyInput.value = localStorage.getItem('openaiKey') || '';
    githubTokenInput.value = localStorage.getItem('githubToken') || '';

    // kleine welkomsttekst
    appendMessage('assistant', 'Welkom — start met typen. Open instellingen via de knop bovenaan.');
  })();

  // Expose for debugging (optioneel)
  window.aphex = {
    toggleSettingsModal,
    saveSettings,
    sendMessage
  };
})();
