const chatEl = document.getElementById('chat');
const formEl = document.getElementById('chat-form');
const promptEl = document.getElementById('prompt');
const statusEl = document.getElementById('status');
const badgeProviderEl = document.getElementById('badge-provider');
const badgeModelEl = document.getElementById('badge-model');
const welcomeEl = document.getElementById('welcome');
const typingEl = document.getElementById('typing');
const scrollBtn = document.getElementById('scroll-bottom');
const providerEl = document.getElementById('provider');
const modelEl = document.getElementById('model');
const reasoningEl = document.getElementById('reasoning');
const convListEl = document.getElementById('conv-list');
const newConvoBtn = document.getElementById('new-convo');
const renameConvoBtn = document.getElementById('rename-convo');
const deleteConvoBtn = document.getElementById('delete-convo');
const stopBtn = document.getElementById('stop-stream');
const convSystemPromptEl = document.getElementById('conv-system-prompt');
const convTempEl = document.getElementById('conv-temperature');
const convTopPEl = document.getElementById('conv-top-p');
const convSaveBtn = document.getElementById('conv-save');
const convSearchEl = document.getElementById('conv-search');
const settingsModal = document.getElementById('settings-modal');
const openSettingsBtn = document.getElementById('open-settings');
const closeSettingsBtn = document.getElementById('close-settings');
const sProvider = document.getElementById('s-provider');
const sModel = document.getElementById('s-model');
const sOpenAI = document.getElementById('s-openai');
const sOpenRouter = document.getElementById('s-openrouter');
const sAzEndpoint = document.getElementById('s-az-endpoint');
const sAzKey = document.getElementById('s-az-key');
const sAnthropic = document.getElementById('s-anthropic');
const sGemini = document.getElementById('s-gemini');
const sGoogle = document.getElementById('s-google');
const saveSettingsBtn = document.getElementById('save-settings');

let history = [
  { role: 'system', content: 'You are a helpful assistant.' }
];
let currentConversationId = null;
let streamingWS = null;
let streamingActive = false;
let lastRenderedDay = null;
let pinnedToBottom = true;

// Toast helper
function showToast(msg, ms = 1600) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), ms);
}

function updateBadges() {
  try {
    const prov = sProvider?.value || providerEl?.value || '';
    const model = sModel?.value || modelEl?.value || '';
    if (badgeProviderEl) badgeProviderEl.textContent = prov || 'provider';
    if (badgeModelEl) badgeModelEl.textContent = model || 'model';
  } catch {}
}

function renderMarkdown(content) {
  if (!content) return '';
  let html = window.marked ? marked.parse(content) : content;
  if (window.DOMPurify) html = DOMPurify.sanitize(html, {USE_PROFILES: {html: true}});
  return html;
}

function addMessage(role, content, opts = {}) {
  const row = document.createElement('div');
  row.className = 'row';
  const inner = document.createElement('div');
  inner.className = 'inner';
  const div = document.createElement('div');
  div.className = `message ${role}`;
  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = role === 'user' ? 'U' : 'A';

  if (role === 'assistant' && opts.reasoning) {
    const r = document.createElement('div');
    r.className = 'reasoning';
    r.textContent = `Reasoning: ${opts.reasoning}`;
    div.appendChild(r);
  }
  const body = document.createElement('div');
  body.className = 'content';
  if (role === 'assistant' && window.marked) {
    body.innerHTML = renderMarkdown(content || '');
    // Syntax highlight
    if (window.hljs) {
      body.querySelectorAll('pre code').forEach((el) => {
        hljs.highlightElement(el);
        // Add copy button
        const pre = el.closest('pre');
        if (pre && !pre.querySelector('.copy-btn')) {
          const btn = document.createElement('button');
          btn.textContent = 'Copy';
          btn.className = 'ghost copy-btn';
          btn.style.position = 'absolute';
          btn.style.right = '8px';
          btn.style.top = '8px';
          btn.addEventListener('click', async () => {
            try {
              await navigator.clipboard.writeText(el.innerText);
              btn.textContent = 'Copied!';
              setTimeout(() => (btn.textContent = 'Copy'), 1200);
            } catch {}
          });
          pre.style.position = 'relative';
          pre.appendChild(btn);
        }

        // Add code header with language chip and wrap toggle
        const preEl = el.closest('pre');
        if (preEl && !preEl.previousElementSibling?.classList.contains('code-header')) {
          const langMatch = [...(el.className || '').split(' ')].find(x => x.startsWith('language-'));
          const lang = langMatch ? langMatch.replace('language-', '') : 'code';
          const header = document.createElement('div');
          header.className = 'code-header';
          const left = document.createElement('div');
          const chip = document.createElement('span');
          chip.className = 'chip';
          chip.textContent = lang;
          left.appendChild(chip);
          const right = document.createElement('div');
          const wrap = document.createElement('button');
          wrap.className = 'wrap-toggle';
          wrap.textContent = 'Wrap';
          let wrapped = false;
          wrap.addEventListener('click', () => {
            wrapped = !wrapped;
            el.style.whiteSpace = wrapped ? 'pre-wrap' : 'pre';
            wrap.textContent = wrapped ? 'No wrap' : 'Wrap';
          });
          right.appendChild(wrap);
          header.appendChild(left);
          header.appendChild(right);
          preEl.parentNode?.insertBefore(header, preEl);
        }
      });
    }
  } else {
    body.textContent = content;
  }
  // Minimal toolbar with Copy for entire message
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  const copyBtn = document.createElement('button');
  copyBtn.className = 'icon-btn';
  copyBtn.textContent = 'Copy';
  copyBtn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(role === 'assistant' ? (body.innerText || '') : content || ''); showToast('Copied'); } catch {}
  });
  toolbar.appendChild(copyBtn);
  // Edit/Delete actions
  if (role === 'user') {
    const editBtn = document.createElement('button');
    editBtn.className = 'icon-btn';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => startEditMessage(div, 'user'));
    toolbar.appendChild(editBtn);
  }
  const delBtn = document.createElement('button');
  delBtn.className = 'icon-btn';
  delBtn.textContent = 'Delete';
  delBtn.addEventListener('click', () => deleteMessage(div));
  toolbar.appendChild(delBtn);
  if (role === 'assistant') {
    const regen = document.createElement('button');
    regen.className = 'icon-btn';
    regen.textContent = 'Regenerate';
    regen.addEventListener('click', async () => {
      const lastUser = [...history].reverse().find(m => m.role === 'user');
      if (!lastUser || !lastUser.content) return;
      addMessage('user', lastUser.content);
      await sendPrompt(lastUser.content);
    });
    toolbar.appendChild(regen);
  }

  if (role === 'assistant') {
    div.appendChild(avatar);
    div.appendChild(body);
  } else {
    // user on right: avatar after content works with CSS bubbles
    div.appendChild(body);
    div.appendChild(avatar);
  }
  div.appendChild(toolbar);
  inner.appendChild(div);
  // Day separator
  const nowDay = new Date().toDateString();
  if (lastRenderedDay !== nowDay) {
    const sepRow = document.createElement('div');
    sepRow.className = 'row';
    const sepInner = document.createElement('div');
    sepInner.className = 'inner';
    const sep = document.createElement('div');
    sep.className = 'day-sep';
    const span = document.createElement('span');
    span.textContent = nowDay === new Date().toDateString() ? 'Today' : nowDay;
    sep.appendChild(span);
    sepInner.appendChild(sep);
    sepRow.appendChild(sepInner);
    chatEl.appendChild(sepRow);
    lastRenderedDay = nowDay;
  }
  row.appendChild(inner);
  chatEl.appendChild(row);
  chatEl.scrollTop = chatEl.scrollHeight;
  updateWelcomeVisibility();
}

function collectMessagesFromDOM() {
  const msgs = [];
  // start with system from local history if present
  if (history[0] && history[0].role === 'system') msgs.push(history[0]);
  chatEl.querySelectorAll('.message').forEach(m => {
    if (m.classList.contains('user')) {
      const txt = m.querySelector('.content')?.innerText || '';
      msgs.push({ role: 'user', content: txt });
    } else if (m.classList.contains('assistant')) {
      const txt = m.querySelector('.content')?.innerText || '';
      msgs.push({ role: 'assistant', content: txt });
    }
  });
  return msgs;
}

async function persistMessagesFromDOM() {
  if (!currentConversationId) return;
  const messages = collectMessagesFromDOM();
  try {
    await fetch(`/api/conversations/${encodeURIComponent(currentConversationId)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages })
    });
    await refreshConversations();
  } catch {}
}

function startEditMessage(div, role) {
  const contentEl = div.querySelector('.content');
  if (!contentEl) return;
  const original = contentEl.innerText;
  const ta = document.createElement('textarea');
  ta.value = original;
  ta.style.width = '100%';
  ta.rows = Math.min(8, Math.max(3, original.split('\n').length));
  contentEl.replaceWith(ta);
  const bar = div.querySelector('.toolbar');
  const save = document.createElement('button');
  save.className = 'icon-btn';
  save.textContent = 'Save';
  const cancel = document.createElement('button');
  cancel.className = 'icon-btn';
  cancel.textContent = 'Cancel';
  bar.appendChild(save);
  bar.appendChild(cancel);
  save.addEventListener('click', async () => {
    const newDiv = document.createElement('div');
    newDiv.className = 'content';
    newDiv.textContent = ta.value;
    ta.replaceWith(newDiv);
    save.remove();
    cancel.remove();
    await persistMessagesFromDOM();
  });
  cancel.addEventListener('click', () => {
    const newDiv = document.createElement('div');
    newDiv.className = 'content';
    newDiv.textContent = original;
    ta.replaceWith(newDiv);
    save.remove();
    cancel.remove();
  });
}

async function deleteMessage(div) {
  if (!confirm('Delete this message?')) return;
  div.parentElement?.removeChild(div);
  await persistMessagesFromDOM();
}

async function sendPrompt(text) {
  const userMsg = { role: 'user', content: text };
  const messages = [...history, userMsg];
  statusEl.textContent = 'Thinking...';

  const provider = (providerEl?.value || 'openai');
  const model = (modelEl?.value || 'gpt-4o-mini');
  // Auto-title conversation from first user message if blank
  (async () => {
    try {
      if (currentConversationId) {
        const res = await fetch(`/api/conversations/${encodeURIComponent(currentConversationId)}`);
        const conv = await res.json();
        const currentTitle = (conv && conv.title) || '';
        if (!currentTitle || currentTitle === 'New Chat') {
          const newTitle = text.slice(0, 50).trim() || 'Conversation';
          await fetch(`/api/conversations/${encodeURIComponent(currentConversationId)}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: newTitle })
          });
          await refreshConversations();
        }
      }
    } catch {}
  })();
  const reasoning = !!reasoningEl?.checked;

  // Prefer WebSocket streaming
  try {
    await startStreaming(messages, { provider, model, reasoning, conversation_id: currentConversationId }, userMsg);
  } catch (e) {
    // Fallback to HTTP if WS fails
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, provider, model, conversation_id: currentConversationId, reasoning })
      });
      const data = await res.json();
      const answer = data.answer || '';
      const reason = data.reasoning || null;
      history.push(userMsg);
      history.push({ role: 'assistant', content: answer, reasoning: reason });
      addMessage('assistant', answer, { reasoning: reason });
      await refreshConversations();
    } catch (err) {
      addMessage('assistant', `[Error: ${err}]`);
    }
  } finally {
    statusEl.textContent = 'Ready';
  }
}

async function startStreaming(messages, meta, userMsg) {
  if (streamingActive && streamingWS) {
    try { streamingWS.close(); } catch {}
  }
  const loc = window.location;
  const scheme = loc.protocol === 'https:' ? 'wss' : 'ws';
  const wsUrl = `${scheme}://${loc.host}/ws/chat`;
  const ws = new WebSocket(wsUrl);
  streamingWS = ws;
  streamingActive = true;
  stopBtn?.removeAttribute('disabled');
  // Build assistant message with same structure as addMessage
  const row = document.createElement('div');
  row.className = 'row';
  const inner = document.createElement('div');
  inner.className = 'inner';
  const assistantDiv = document.createElement('div');
  assistantDiv.className = 'message assistant';
  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = 'A';
  const body = document.createElement('div');
  body.className = 'content';
  assistantDiv.appendChild(avatar);
  assistantDiv.appendChild(body);
  // minimal toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  const copyBtn = document.createElement('button');
  copyBtn.className = 'icon-btn';
  copyBtn.textContent = 'Copy';
  copyBtn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(body.innerText || ''); showToast('Copied'); } catch {}
  });
  toolbar.appendChild(copyBtn);
  assistantDiv.appendChild(toolbar);
  inner.appendChild(assistantDiv);
  row.appendChild(inner);
  chatEl.appendChild(row);
  chatEl.scrollTop = chatEl.scrollHeight;

  let accum = '';
  ws.onopen = () => {
    // include per-conversation params (for now used server-side only if stored)
    let temperature = convTempEl?.value ? Number(convTempEl.value) : undefined;
    let top_p = convTopPEl?.value ? Number(convTopPEl.value) : undefined;
    ws.send(JSON.stringify({ messages, ...meta, temperature, top_p }));
  };
  ws.onmessage = (evt) => {
    const text = evt.data || '';
    if (text === '[END]') {
      streamingActive = false;
      stopBtn?.setAttribute('disabled', '');
      // save history client-side; server persisted already
      history.push(userMsg);
      history.push({ role: 'assistant', content: accum });
      if (typingEl) typingEl.style.display = 'none';
      refreshConversations();
      updateWelcomeVisibility();
      return;
    }
    accum += text;
    body.innerHTML = renderMarkdown(accum);
    if (window.hljs) body.querySelectorAll('pre code').forEach(el => hljs.highlightElement(el));
    chatEl.scrollTop = chatEl.scrollHeight;
  };
  ws.onerror = (e) => {
    streamingActive = false;
    stopBtn?.setAttribute('disabled', '');
    if (typingEl) typingEl.style.display = 'none';
  };
  ws.onclose = () => {
    streamingActive = false;
    statusEl.textContent = 'Ready';
    refreshConversations();
    if (typingEl) typingEl.style.display = 'none';
  };
  streamingWS.onopen = () => {
    streamingActive = true;
    statusEl.textContent = 'Streaming...';
    if (typingEl) typingEl.style.display = '';
  };
}

chatEl.addEventListener('scroll', () => {
  const nearBottom = chatEl.scrollHeight - chatEl.scrollTop - chatEl.clientHeight < 60;
  pinnedToBottom = nearBottom;
  if (!nearBottom) scrollBtn?.classList.add('show'); else scrollBtn?.classList.remove('show');
});
scrollBtn?.addEventListener('click', () => {
  chatEl.scrollTo({ top: chatEl.scrollHeight, behavior: 'smooth' });
});

formEl.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = promptEl.value.trim();
  if (!text) return;
  promptEl.value = '';
  addMessage('user', text);
  sendPrompt(text);
});

// Enter to send, Shift+Enter newline
promptEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    formEl.requestSubmit();
  }
});

// Settings modal logic
function openSettings() { settingsModal?.classList.remove('hidden'); }
function closeSettings() { settingsModal?.classList.add('hidden'); }
openSettingsBtn?.addEventListener('click', openSettings);
closeSettingsBtn?.addEventListener('click', closeSettings);
settingsModal?.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-backdrop')) closeSettings();
});

async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    if (data.provider) sProvider.value = data.provider;
    await populateModels(providerEl, modelEl, data.provider || providerEl?.value);
    if (data.model) modelEl.value = data.model;
    await populateModels(sProvider, sModel, data.provider || sProvider?.value);
    if (data.model) sModel.value = data.model;
    // For keys, we only know presence; don't auto-fill passwords for security.
    providerEl && (providerEl.value = data.provider || providerEl.value);
  } catch {}
  updateBadges();
  updateWelcomeVisibility();
}

async function saveSettings() {
  const payload = {
    provider: sProvider.value,
    model: sModel.value.trim(),
  };
  if (sOpenAI.value) payload.OPENAI_API_KEY = sOpenAI.value;
  if (sOpenRouter.value) payload.OPENROUTER_API_KEY = sOpenRouter.value;
  if (sAzEndpoint.value) payload.AZURE_OPENAI_ENDPOINT = sAzEndpoint.value;
  if (sAzKey.value) payload.AZURE_OPENAI_API_KEY = sAzKey.value;
  if (sAnthropic.value) payload.ANTHROPIC_API_KEY = sAnthropic.value;
  if (sGemini.value) payload.GEMINI_API_KEY = sGemini.value;
  if (sGoogle.value) payload.GOOGLE_API_KEY = sGoogle.value;
  try {
    return fetch('/api/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    // Update UI controls
    if (providerEl) providerEl.value = sProvider.value;
    await populateModels(providerEl, modelEl, sProvider.value);
    if (modelEl && sModel.value) modelEl.value = sModel.value;
    closeSettings();
  } catch (e) {
    alert('Failed to save settings: ' + e);
  }
}

saveSettingsBtn?.addEventListener('click', saveSettings);

// Load on boot
loadSettings();

// Populate models for a provider
async function populateModels(providerSelect, modelSelect, providerValue) {
  const prov = (providerValue || providerSelect?.value || 'openai');
  try {
    const res = await fetch(`/api/models?provider=${encodeURIComponent(prov)}`);
    const data = await res.json();
    const models = data.models || [];
    if (!modelSelect) return;
    modelSelect.innerHTML = '';
    if (models.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = data.note || data.error || 'Enter model name';
      modelSelect.appendChild(opt);
      return;
    }
    for (const m of models) {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name || m.id;
      modelSelect.appendChild(opt);
    }
  } catch (e) {
    // ignore
  }
}

// React to provider changes
providerEl?.addEventListener('change', () => populateModels(providerEl, modelEl));
sProvider?.addEventListener('change', () => populateModels(sProvider, sModel));
providerEl?.addEventListener('change', updateBadges);
sProvider?.addEventListener('change', updateBadges);
sModel?.addEventListener('change', updateBadges);
modelEl?.addEventListener('change', updateBadges);

// Initial population if no settings
populateModels(providerEl, modelEl);
populateModels(sProvider, sModel);

// --- Conversation UI ---
async function refreshConversations() {
  try {
    const res = await fetch('/api/conversations');
    const data = await res.json();
    window.__allConvs = data.conversations || [];
    applyConvFilter();
    return data.conversations || [];
  } catch {}
}

function renderConvList(convs) {
  if (!convListEl) return;
  convListEl.innerHTML = '';
  convs.forEach(c => {
    const item = document.createElement('div');
    item.className = 'conv-item' + (c.id === currentConversationId ? ' active' : '');
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = c.title || 'Conversation';
    const time = document.createElement('div');
    time.className = 'time';
    time.textContent = c.updated_at ? new Date(c.updated_at).toLocaleString() : '';
    const right = document.createElement('div');
    right.style.marginLeft = 'auto';
    const pin = document.createElement('button');
    pin.className = 'ghost';
    pin.title = c.pinned ? 'Unpin' : 'Pin';
    pin.textContent = c.pinned ? '★' : '☆';
    pin.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await fetch(`/api/conversations/${encodeURIComponent(c.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pinned: !c.pinned }) });
        await refreshConversations();
      } catch {}
    });
    right.appendChild(pin);
    item.appendChild(title);
    item.appendChild(time);
    item.appendChild(right);
    item.addEventListener('click', () => selectConversation(c.id));
    item.addEventListener('dblclick', () => {
      currentConversationId = c.id;
      renameConversation();
    });
    convListEl.appendChild(item);
  });
}

function applyConvFilter() {
  const q = (convSearchEl?.value || '').toLowerCase();
  const list = (window.__allConvs || []);
  if (!q) return renderConvList(list);
  const filtered = list.filter(c => (c.title || '').toLowerCase().includes(q));
  renderConvList(filtered);
}
convSearchEl?.addEventListener('input', applyConvFilter);

async function selectConversation(id) {
  if (!id) return;
  currentConversationId = id;
  chatEl.innerHTML = '';
  history = [ { role: 'system', content: 'You are a helpful assistant.' } ];
  lastRenderedDay = null;
  try {
    const res = await fetch(`/api/conversations/${encodeURIComponent(id)}`);
    const conv = await res.json();
    // Populate settings panel
    if (convSystemPromptEl) convSystemPromptEl.value = conv.system_prompt || '';
    if (convTempEl) convTempEl.value = conv.temperature ?? '';
    if (convTopPEl) convTopPEl.value = conv.top_p ?? '';
    // Re-render messages
    (conv.messages || []).forEach(m => {
      if (m.role === 'user') {
        addMessage('user', m.content);
      } else if (m.role === 'assistant') {
        addMessage('assistant', m.content, { reasoning: m.reasoning });
      }
      if (m.role !== 'system') history.push(m);
    });
  } catch {}
  await refreshConversations();
  updateWelcomeVisibility();
}

async function newConversation() {
  try {
    const res = await fetch('/api/conversations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    const conv = await res.json();
    currentConversationId = conv.id;
    chatEl.innerHTML = '';
    history = [ { role: 'system', content: 'You are a helpful assistant.' } ];
    await selectConversation(conv.id);
    showToast('New conversation created');
  } catch {}
}

async function renameConversation() {
  if (!currentConversationId) return;
  const title = prompt('Rename conversation:');
  if (!title) return;
  try {
    await fetch(`/api/conversations/${encodeURIComponent(currentConversationId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
    await refreshConversations();
    showToast('Conversation renamed');
  } catch {}
}

async function deleteConversation() {
  if (!currentConversationId) return;
  if (!confirm('Delete this conversation?')) return;
  try {
    await fetch(`/api/conversations/${encodeURIComponent(currentConversationId)}`, { method: 'DELETE' });
    currentConversationId = null;
    chatEl.innerHTML = '';
    history = [ { role: 'system', content: 'You are a helpful assistant.' } ];
    const convs = await refreshConversations();
    if (convs && convs[0]) {
      await selectConversation(convs[0].id);
    }
    showToast('Conversation deleted');
  } catch {}
}

newConvoBtn?.addEventListener('click', newConversation);
renameConvoBtn?.addEventListener('click', renameConversation);
deleteConvoBtn?.addEventListener('click', deleteConversation);
stopBtn?.addEventListener('click', () => {
  if (streamingWS && streamingActive) {
    try { streamingWS.close(); } catch {}
  }
});

convSaveBtn?.addEventListener('click', async () => {
  if (!currentConversationId) return;
  const title = undefined; // keep current title
  const system_prompt = convSystemPromptEl?.value || '';
  const temperature = convTempEl?.value ? Number(convTempEl.value) : null;
  const top_p = convTopPEl?.value ? Number(convTopPEl.value) : null;
  try {
    await fetch(`/api/conversations/${encodeURIComponent(currentConversationId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, system_prompt, temperature, top_p })
    });
    showToast('Conversation settings saved');
  } catch {}
});

// Boot: ensure a conversation exists and select one
(async () => {
  const convs = await refreshConversations();
  if (!convs || convs.length === 0) {
    await newConversation();
  } else {
    // Select most recent
    const first = convs[0];
    await selectConversation(first.id);
  }
})();
