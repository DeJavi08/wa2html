/**
 * script.js — WA-HTML Viewer
 * Vanilla JS, no frameworks, no backend.
 * Reads /chats/{name}/chat.html + config.json and renders them.
 */

'use strict';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const CHATS_DIR = './chats/';
const STORAGE_KEY_PREFIX = 'wa_viewer_me_';

// ─── STATE ────────────────────────────────────────────────────────────────────

const state = {
  chats: [],          // [{name, path}]
  current: null,      // current chat name
  config: null,       // loaded config.json
  messages: null,     // parsed DOM nodes from chat.html
  me: null,           // resolved "me"
};

// ─── DOM REFS ─────────────────────────────────────────────────────────────────

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

const dom = {
  chatList:         $('#chat-list'),
  sidebarLoading:   $('#sidebar-loading'),
  chatSearch:       $('#chat-search'),

  welcomeScreen:    $('#welcome-screen'),
  chatView:         $('#chat-view'),

  chatAvatar:       $('#chat-avatar'),
  chatName:         $('#chat-name'),
  chatMeta:         $('#chat-meta'),
  messagesInner:    $('#messages-inner'),
  chatLoading:      $('#chat-loading'),

  btnBack:          $('#btn-back'),
  btnSettings:      $('#btn-settings'),
  btnSettingsClose: $('#btn-settings-close'),
  btnClearStorage:  $('#btn-clear-storage'),
  btnViewAs:        $('#btn-viewas'),
  viewasLabel:      $('#viewas-label'),
  viewasDropdown:   $('#viewas-dropdown'),

  settingsOverlay:  $('#settings-overlay'),
  settingsPanel:    $('#settings-panel'),
  settingsChatCount:$('#settings-chat-count'),

  sidebar:          $('#sidebar'),
  main:             $('#main'),
};

// ─── INIT ─────────────────────────────────────────────────────────────────────

async function init() {
  bindEvents();
  await loadChatIndex();
}

// ─── EVENT BINDING ────────────────────────────────────────────────────────────

function bindEvents() {
  // Back button (mobile)
  dom.btnBack.addEventListener('click', () => {
    dom.sidebar.classList.remove('slide-out');
    dom.main.classList.remove('slide-in');
    state.current = null;
    $$('.chat-item').forEach(el => el.classList.remove('active'));
  });

  // Settings open/close
  dom.btnSettings.addEventListener('click', openSettings);
  dom.btnSettingsClose.addEventListener('click', closeSettings);
  dom.settingsOverlay.addEventListener('click', closeSettings);

  // Clear localStorage
  dom.btnClearStorage.addEventListener('click', () => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(STORAGE_KEY_PREFIX)) localStorage.removeItem(key);
    }
    alert('Semua override "me" telah dihapus. Reload untuk melihat perubahan.');
  });

  // View as dropdown
  dom.btnViewAs.addEventListener('click', (e) => {
    e.stopPropagation();
    dom.viewasDropdown.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!dom.viewasDropdown.contains(e.target) && e.target !== dom.btnViewAs) {
      dom.viewasDropdown.classList.add('hidden');
    }
  });

  // Search filter
  dom.chatSearch.addEventListener('input', () => {
    const q = dom.chatSearch.value.toLowerCase().trim();
    $$('.chat-item').forEach(item => {
      const name = item.dataset.name.toLowerCase();
      item.style.display = name.includes(q) ? '' : 'none';
    });
  });
}

// ─── SETTINGS ─────────────────────────────────────────────────────────────────

function openSettings() {
  dom.settingsOverlay.classList.remove('hidden');
  dom.settingsPanel.classList.remove('hidden');
  dom.settingsChatCount.textContent = `${state.chats.length} chat ditemukan`;
}

function closeSettings() {
  dom.settingsOverlay.classList.add('hidden');
  dom.settingsPanel.classList.add('hidden');
}

// ─── CHAT INDEX ───────────────────────────────────────────────────────────────

/**
 * Discovery strategy:
 * 1. Try to fetch chats/index.json (optional manifest for GitHub Pages)
 * 2. Fallback: try common folder names from localStorage history
 * 3. Fallback: scan chats/manifest.txt
 * 4. Show instructions if nothing found
 */
async function loadChatIndex() {
  let chats = [];

  // Strategy 1: index.json
  try {
    const res = await fetch(`${CHATS_DIR}index.json`);
    if (res.ok) {
      const data = await res.json();
      // Supports both array of strings and array of objects
      chats = data.map(item =>
        typeof item === 'string' ? { name: item } : item
      );
    }
  } catch (_) {}

  // Strategy 2: manifest.txt (one folder name per line)
  if (chats.length === 0) {
    try {
      const res = await fetch(`${CHATS_DIR}manifest.txt`);
      if (res.ok) {
        const text = await res.text();
        chats = text.split('\n')
          .map(l => l.trim())
          .filter(l => l && !l.startsWith('#'))
          .map(name => ({ name }));
      }
    } catch (_) {}
  }

  // Strategy 3: restore from sessionStorage (previously loaded chats this session)
  if (chats.length === 0) {
    const saved = sessionStorage.getItem('wa_viewer_known_chats');
    if (saved) {
      try {
        chats = JSON.parse(saved);
      } catch (_) {}
    }
  }

  // Remove loading spinner
  dom.sidebarLoading.remove();

  if (chats.length > 0) {
    state.chats = chats;
    renderChatList(chats);
  } else {
    renderNoChats();
  }
}

function renderNoChats() {
  dom.chatList.innerHTML = `
    <div class="chat-list-empty">
      <span style="font-size:36px">📂</span>
      <p><strong>Tidak ada chat ditemukan.</strong></p>
      <p style="font-size:12px;margin-top:4px">Buat file <code>chats/index.json</code> atau <code>chats/manifest.txt</code> berisi daftar nama folder chat.</p>
    </div>`;
}

function renderChatList(chats) {
  dom.chatList.innerHTML = '';
  chats.forEach((chat, i) => {
    const item = makeChatItem(chat, i);
    dom.chatList.appendChild(item);
    // Load config in background for meta info
    loadChatMeta(chat.name, item);
  });
  // Save to session for next refresh
  sessionStorage.setItem('wa_viewer_known_chats', JSON.stringify(chats));
}

function makeChatItem(chat, index) {
  const item = document.createElement('div');
  item.className = 'chat-item';
  item.dataset.name = chat.name;
  item.style.animationDelay = `${index * 40}ms`;

  const displayName = formatChatName(chat.name);
  const initials = getInitials(displayName);

  item.innerHTML = `
    <div class="chat-item-avatar">${initials}</div>
    <div class="chat-item-info">
      <div class="chat-item-name">${esc(displayName)}</div>
      <div class="chat-item-meta chat-meta-${slugify(chat.name)}">Memuat info…</div>
    </div>`;

  item.addEventListener('click', () => loadChat(chat.name));
  return item;
}

async function loadChatMeta(chatName, itemEl) {
  try {
    const res = await fetch(`${CHATS_DIR}${chatName}/config.json`);
    if (!res.ok) throw new Error('no config');
    const config = await res.json();
    const metaEl = $('.chat-item-meta', itemEl);
    if (!metaEl) return;
    const parts = config.participants || [];
    const total = config.totalMessages ? `${config.totalMessages} pesan` : '';
    metaEl.textContent = parts.length > 0 ? parts.join(', ') + (total ? ` · ${total}` : '') : total || '—';
  } catch (_) {
    const metaEl = itemEl.querySelector('.chat-item-meta');
    if (metaEl) metaEl.textContent = '—';
  }
}

// ─── LOAD CHAT ────────────────────────────────────────────────────────────────

async function loadChat(chatName) {
  if (state.current === chatName) return;
  state.current = chatName;

  // UI: highlight sidebar item
  $$('.chat-item').forEach(el => el.classList.toggle('active', el.dataset.name === chatName));

  // Show chat view, hide welcome
  dom.welcomeScreen.classList.add('hidden');
  dom.chatView.classList.remove('hidden');
  dom.chatLoading.classList.remove('hidden');

  // Mobile: slide panels
  dom.sidebar.classList.add('slide-out');
  dom.main.classList.add('slide-in');

  const displayName = formatChatName(chatName);
  dom.chatName.textContent = displayName;
  dom.chatAvatar.textContent = getInitials(displayName);
  dom.chatMeta.textContent = '';
  dom.messagesInner.innerHTML = '';
  dom.viewasDropdown.classList.add('hidden');

  // Load config + html in parallel
  let config = null;
  let htmlText = null;

  try {
    [config, htmlText] = await Promise.all([
      fetchConfig(chatName),
      fetchChatHTML(chatName),
    ]);
  } catch (e) {
    dom.chatLoading.classList.add('hidden');
    showChatError('Gagal memuat chat. Periksa apakah file ada di folder /chats/.');
    return;
  }

  state.config = config;

  // Resolve "me": localStorage override > config.json
  const storageKey = STORAGE_KEY_PREFIX + chatName;
  const storedMe = localStorage.getItem(storageKey);
  state.me = storedMe || (config ? config.me : null);

  // Update header meta
  if (config) {
    const participants = config.participants || [];
    dom.chatMeta.textContent = participants.join(', ');
    buildViewAsDropdown(chatName, participants, state.me);
    dom.viewasLabel.textContent = state.me || 'View as';
  } else {
    dom.viewasLabel.textContent = 'View as';
    dom.viewasDropdown.innerHTML = '';
  }

  // Parse & render messages
  const messages = parseChatHTML(htmlText);
  renderMessages(messages, state.me);

  dom.chatLoading.classList.add('hidden');

  // Scroll to bottom
  requestAnimationFrame(() => {
    dom.messagesInner.parentElement.scrollTop = dom.messagesInner.parentElement.scrollHeight;
  });
}

async function fetchConfig(chatName) {
  try {
    const res = await fetch(`${CHATS_DIR}${chatName}/config.json`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchChatHTML(chatName) {
  const res = await fetch(`${CHATS_DIR}${chatName}/chat.html`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

// ─── PARSE CHAT HTML ──────────────────────────────────────────────────────────

/**
 * Extracts message nodes from the chat.html file.
 * The builder outputs: .message[data-sender][data-type][data-date][data-time],
 *                      .date-separator, .system-message
 */
function parseChatHTML(htmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlText, 'text/html');
  const container = doc.querySelector('#chat-container') || doc.body;
  const nodes = container.childNodes;
  const items = [];

  for (const node of nodes) {
    if (node.nodeType !== Node.ELEMENT_NODE) continue;

    if (node.classList.contains('date-separator')) {
      items.push({ type: 'date', html: node.outerHTML });
    } else if (node.classList.contains('system-message')) {
      items.push({ type: 'system', html: node.outerHTML });
    } else if (node.classList.contains('message')) {
      items.push({
        type: 'message',
        sender: node.dataset.sender || '',
        msgType: node.dataset.type || 'text',
        date: node.dataset.date || '',
        time: node.dataset.time || '',
        html: node.innerHTML,
        el: node,
      });
    }
  }

  return items;
}

// ─── RENDER MESSAGES ──────────────────────────────────────────────────────────

function renderMessages(items, me) {
  dom.messagesInner.innerHTML = '';
  const fragment = document.createDocumentFragment();

  for (const item of items) {
    if (item.type === 'date') {
      const div = document.createElement('div');
      div.innerHTML = item.html;
      fragment.appendChild(div.firstElementChild || div);
    } else if (item.type === 'system') {
      const div = document.createElement('div');
      div.innerHTML = item.html;
      fragment.appendChild(div.firstElementChild || div);
    } else if (item.type === 'message') {
      const bubble = buildBubble(item, me);
      fragment.appendChild(bubble);
    }
  }

  dom.messagesInner.appendChild(fragment);
}

function buildBubble(item, me) {
  const isMe = me && item.sender === me;
  const div = document.createElement('div');
  div.className = `message ${isMe ? 'me' : 'other'}`;
  div.dataset.sender = item.sender;
  div.dataset.type = item.msgType;

  // Rebuild inner HTML from parsed node
  div.innerHTML = item.html;

  // Fix relative media paths to point to the right chat folder
  if (state.current) {
    fixMediaPaths(div, state.current);
  }

  // Sticker bubbles: remove background/shadow
  if (item.msgType === 'sticker') {
    div.style.background = 'transparent';
    div.style.boxShadow = 'none';
    div.style.padding = '0';
    // Remove tail pseudo via class
    div.classList.add('sticker-bubble');
  }

  // Click-to-expand images
  div.querySelectorAll('img:not(.sticker)').forEach(img => {
    img.addEventListener('click', () => img.classList.toggle('expanded'));
  });

  return div;
}

/**
 * Fix src/href paths in the bubble to point to the correct chat folder.
 * Builder outputs: media/filename.jpg
 * We need:         ./chats/{chatName}/media/filename.jpg
 */
function fixMediaPaths(bubbleEl, chatName) {
  const base = `${CHATS_DIR}${chatName}/`;

  bubbleEl.querySelectorAll('img[src], video[src], audio[src]').forEach(el => {
    const src = el.getAttribute('src');
    if (src && !src.startsWith('http') && !src.startsWith('data:') && !src.startsWith('/') && !src.startsWith('./chats/')) {
      el.setAttribute('src', base + src);
    }
  });

  bubbleEl.querySelectorAll('a[href]:not([href^="http"])').forEach(el => {
    const href = el.getAttribute('href');
    if (href && !href.startsWith('http') && !href.startsWith('/') && !href.startsWith('./chats/')) {
      el.setAttribute('href', base + href);
    }
  });

  // video source children
  bubbleEl.querySelectorAll('source[src]').forEach(el => {
    const src = el.getAttribute('src');
    if (src && !src.startsWith('http') && !src.startsWith('/')) {
      el.setAttribute('src', base + src);
    }
  });
}

// ─── VIEW AS (IDENTITY SWITCH) ────────────────────────────────────────────────

function buildViewAsDropdown(chatName, participants, currentMe) {
  dom.viewasDropdown.innerHTML = '';

  if (!participants || participants.length === 0) {
    dom.viewasDropdown.innerHTML = '<div class="viewas-option" style="color:var(--text-secondary)">Tidak ada peserta</div>';
    return;
  }

  const label = document.createElement('div');
  label.className = 'viewas-dropdown-label';
  label.textContent = 'Lihat sebagai:';
  dom.viewasDropdown.appendChild(label);

  participants.forEach(name => {
    const btn = document.createElement('button');
    btn.className = `viewas-option${name === currentMe ? ' active' : ''}`;
    btn.innerHTML = `
      <span>${esc(name)}</span>
      <svg class="check-icon" viewBox="0 0 24 24" width="16" height="16" fill="var(--wa-green)">
        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
      </svg>`;
    btn.addEventListener('click', () => switchMe(chatName, name));
    dom.viewasDropdown.appendChild(btn);
  });
}

function switchMe(chatName, name) {
  const storageKey = STORAGE_KEY_PREFIX + chatName;
  localStorage.setItem(storageKey, name);
  state.me = name;
  dom.viewasLabel.textContent = name;
  dom.viewasDropdown.classList.add('hidden');

  // Update dropdown active state
  $$('.viewas-option', dom.viewasDropdown).forEach(btn => {
    const isActive = btn.querySelector('span')?.textContent === name;
    btn.classList.toggle('active', isActive);
  });

  // Re-classify bubbles without re-fetching
  $$('.message', dom.messagesInner).forEach(bubble => {
    const sender = bubble.dataset.sender;
    const isMe = sender === name;
    bubble.classList.toggle('me', isMe);
    bubble.classList.toggle('other', !isMe);

    // Show/hide sender name
    const senderEl = bubble.querySelector('.message-sender');
    if (senderEl) {
      senderEl.style.display = isMe ? 'none' : '';
    }
  });
}

// ─── ERROR STATE ──────────────────────────────────────────────────────────────

function showChatError(msg) {
  dom.messagesInner.innerHTML = `
    <div class="error-state">
      <span>⚠️</span>
      <p>${esc(msg)}</p>
    </div>`;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function esc(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatChatName(name) {
  // "WhatsApp-Chat-with-Alice" → "Alice" or just prettify kebab/underscore
  const cleaned = name
    .replace(/^whatsapp[-_]chat[-_]with[-_]/i, '')
    .replace(/^chat[-_]/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function getInitials(name) {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

function slugify(str) {
  return str.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

// ─── START ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);
