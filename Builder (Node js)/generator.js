/**
 * generator.js
 * Generates chat.html and config.json from parsed messages
 */

const fs = require('fs');
const path = require('path');

/**
 * Escape HTML special characters
 */
function escHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Convert newlines to <br> and linkify URLs
 */
function formatText(text) {
  const escaped = escHtml(text);
  // Linkify URLs
  const linked = escaped.replace(
    /(https?:\/\/[^\s<>"]+)/g,
    '<a href="$1" target="_blank" rel="noopener">$1</a>'
  );
  return linked.replace(/\n/g, '<br>');
}

/**
 * Render a single message bubble
 */
function renderMessage(msg, mediaPathMap, driveMap) {
  if (msg.isSystem) {
    return `<div class="system-message">${escHtml(msg.content)}</div>`;
  }

  const senderClass = 'message'; // viewer will add .me or .other based on config.json
  const senderAttr = `data-sender="${escHtml(msg.sender)}"`;
  const timestampAttr = `data-date="${escHtml(msg.date)}" data-time="${escHtml(msg.time)}"`;
  const typeAttr = `data-type="${escHtml(msg.type)}"`;

  let mediaHtml = '';

  if (msg.type === 'deleted') {
    mediaHtml = `<span class="deleted">🚫 Pesan ini telah dihapus</span>`;
  } else if (msg.type === 'media_omitted') {
    mediaHtml = `<span class="media-omitted">📎 Media tidak tersedia</span>`;
  } else if (msg.filename) {
    const localPath = mediaPathMap.get(msg.filename);
    const drivePath = driveMap.get(msg.filename);

    if (drivePath) {
      // Google Drive iframe
      mediaHtml = `<div class="media-container drive-media">
        <iframe src="${escHtml(drivePath)}" frameborder="0" allowfullscreen loading="lazy"></iframe>
        <span class="media-label">📁 ${escHtml(msg.filename)}</span>
      </div>`;
    } else if (localPath) {
      if (msg.type === 'image') {
        mediaHtml = `<div class="media-container">
          <img src="${escHtml(localPath)}" alt="${escHtml(msg.filename)}" loading="lazy" onclick="this.classList.toggle('expanded')">
        </div>`;
      } else if (msg.type === 'video') {
        mediaHtml = `<div class="media-container">
          <video controls preload="metadata" src="${escHtml(localPath)}">
            Your browser does not support video.
          </video>
        </div>`;
      } else if (msg.type === 'sticker') {
        mediaHtml = `<div class="media-container sticker-container">
          <img src="${escHtml(localPath)}" alt="sticker" class="sticker" loading="lazy">
        </div>`;
      } else if (msg.type === 'audio') {
        mediaHtml = `<div class="media-container">
          <audio controls src="${escHtml(localPath)}">
            Your browser does not support audio.
          </audio>
          <span class="media-label">🎵 ${escHtml(msg.filename)}</span>
        </div>`;
      } else if (msg.type === 'document') {
        const ext = path.extname(msg.filename).toLowerCase();
        if (ext === '.pdf') {
          mediaHtml = `<div class="media-container doc-container">
            <a href="${escHtml(localPath)}" target="_blank" class="doc-link">
              <span class="doc-icon">📄</span>
              <span class="doc-name">${escHtml(msg.filename)}</span>
            </a>
          </div>`;
        } else {
          mediaHtml = `<div class="media-container doc-container">
            <a href="${escHtml(localPath)}" download class="doc-link">
              <span class="doc-icon">📎</span>
              <span class="doc-name">${escHtml(msg.filename)}</span>
            </a>
          </div>`;
        }
      } else {
        mediaHtml = `<div class="media-container">
          <a href="${escHtml(localPath)}" target="_blank">📎 ${escHtml(msg.filename)}</a>
        </div>`;
      }
    } else {
      // File not found
      mediaHtml = `<div class="media-not-found">⚠️ Media not found: ${escHtml(msg.filename)}</div>`;
    }
  }

  // Text content (may accompany media, e.g. caption)
  let textHtml = '';
  if (msg.type === 'text' && msg.content) {
    textHtml = `<div class="message-text">${formatText(msg.content)}</div>`;
  } else if (msg.filename && msg.content) {
    // Check if content is just the filename line or has caption
    const contentWithoutFilename = msg.content
      .replace(msg.filename, '')
      .replace(/\(file terlampir\)/i, '')
      .replace(/<Media omitted>/i, '')
      .trim();
    if (contentWithoutFilename) {
      textHtml = `<div class="message-caption">${formatText(contentWithoutFilename)}</div>`;
    }
  }

  return `<div class="${senderClass}" ${senderAttr} ${timestampAttr} ${typeAttr}>
  <div class="message-sender">${escHtml(msg.sender)}</div>
  ${mediaHtml}
  ${textHtml}
  <div class="message-time">${escHtml(msg.time)}</div>
</div>`;
}

/**
 * Group messages by date for date separators
 */
function groupByDate(messages) {
  const groups = [];
  let currentDate = null;

  for (const msg of messages) {
    if (msg.date !== currentDate) {
      currentDate = msg.date;
      groups.push({ type: 'date', date: msg.date });
    }
    groups.push({ type: 'message', msg });
  }

  return groups;
}

/**
 * Generate full chat.html
 */
function generateHTML(messages, mediaPathMap, driveMap, chatName) {
  const groups = groupByDate(messages);
  const items = groups.map((item) => {
    if (item.type === 'date') {
      return `<div class="date-separator"><span>${escHtml(item.date)}</span></div>`;
    }
    return renderMessage(item.msg, mediaPathMap, driveMap);
  });

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(chatName)}</title>
  <style>
    /* ===== BASE ===== */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      font-size: 14px;
      background: #e5ddd5;
      color: #111;
    }

    #chat-container {
      max-width: 780px;
      margin: 0 auto;
      padding: 16px 12px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    /* ===== DATE SEPARATOR ===== */
    .date-separator {
      display: flex;
      justify-content: center;
      margin: 12px 0 8px;
    }
    .date-separator span {
      background: rgba(255,255,255,0.85);
      border-radius: 8px;
      padding: 4px 12px;
      font-size: 12px;
      color: #555;
      box-shadow: 0 1px 2px rgba(0,0,0,0.12);
    }

    /* ===== SYSTEM MESSAGE ===== */
    .system-message {
      text-align: center;
      font-size: 12px;
      color: #666;
      background: rgba(255,255,255,0.7);
      border-radius: 8px;
      padding: 5px 12px;
      margin: 4px auto;
      max-width: 80%;
    }

    /* ===== MESSAGE BUBBLE ===== */
    .message {
      max-width: 72%;
      padding: 6px 9px 20px;
      border-radius: 8px;
      position: relative;
      margin: 1px 0;
      background: #fff;
      box-shadow: 0 1px 1px rgba(0,0,0,0.12);
      align-self: flex-start;
      word-break: break-word;
    }

    /* .me is applied by the viewer JS based on config.json */
    .message.me {
      background: #dcf8c6;
      align-self: flex-end;
      border-bottom-right-radius: 2px;
    }
    .message.other {
      align-self: flex-start;
      border-bottom-left-radius: 2px;
    }

    .message-sender {
      font-size: 12px;
      font-weight: 600;
      color: #128c7e;
      margin-bottom: 3px;
    }
    .message.me .message-sender { display: none; }

    .message-text { line-height: 1.5; }
    .message-caption { font-size: 13px; color: #333; margin-top: 4px; line-height: 1.4; }

    .message-time {
      position: absolute;
      bottom: 4px;
      right: 8px;
      font-size: 10px;
      color: #999;
      white-space: nowrap;
    }

    /* ===== MEDIA ===== */
    .media-container {
      margin: 2px 0 4px;
      border-radius: 6px;
      overflow: hidden;
      max-width: 300px;
    }

    .media-container img {
      display: block;
      max-width: 100%;
      max-height: 300px;
      border-radius: 6px;
      cursor: pointer;
      transition: max-height 0.3s ease;
      object-fit: cover;
    }
    .media-container img.expanded {
      max-height: 600px;
      object-fit: contain;
    }

    .media-container video {
      display: block;
      max-width: 100%;
      max-height: 300px;
      border-radius: 6px;
    }

    .media-container audio {
      display: block;
      width: 100%;
      min-width: 200px;
    }

    .sticker-container { background: transparent; box-shadow: none; }
    .sticker { max-width: 150px !important; max-height: 150px !important; object-fit: contain !important; }

    .drive-media iframe {
      width: 300px;
      height: 200px;
      border-radius: 6px;
    }

    .doc-container { background: #f5f5f5; border-radius: 8px; padding: 8px 10px; }
    .doc-link { display: flex; align-items: center; gap: 8px; text-decoration: none; color: #333; }
    .doc-link:hover { color: #075e54; }
    .doc-icon { font-size: 22px; }
    .doc-name { font-size: 13px; word-break: break-all; }

    .media-label { display: block; font-size: 11px; color: #888; margin-top: 3px; }
    .media-not-found { color: #c0392b; font-size: 12px; font-style: italic; padding: 4px 0; }
    .media-omitted { color: #999; font-size: 12px; font-style: italic; }
    .deleted { color: #aaa; font-size: 13px; font-style: italic; }

    /* ===== LINKS ===== */
    .message-text a, .message-caption a {
      color: #075e54;
      word-break: break-all;
    }

    /* ===== RESPONSIVE ===== */
    @media (max-width: 480px) {
      .message { max-width: 88%; }
      .media-container { max-width: 240px; }
      .drive-media iframe { width: 240px; height: 160px; }
    }
  </style>
</head>
<body>
  <div id="chat-container">
    ${items.join('\n    ')}
  </div>
</body>
</html>`;
}

/**
 * Write chat.html and config.json to output dir
 */
function generateOutput(outputDir, { messages, participants, me, chatName, mediaPathMap, driveMap }) {
  const fs = require('fs');

  // chat.html
  const html = generateHTML(messages, mediaPathMap, driveMap, chatName);
  fs.writeFileSync(path.join(outputDir, 'chat.html'), html, 'utf8');

  // config.json
  const config = {
    me,
    participants,
    chatName,
    generatedAt: new Date().toISOString(),
    totalMessages: messages.filter((m) => !m.isSystem).length,
  };
  fs.writeFileSync(path.join(outputDir, 'config.json'), JSON.stringify(config, null, 2), 'utf8');
}

module.exports = { generateOutput };
