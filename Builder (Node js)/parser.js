/**
 * parser.js
 * Parses WhatsApp exported chat .txt into structured message objects
 */

// Regex patterns for both WhatsApp export formats
// Format A: [dd/mm/yy, hh.mm] Name: message
// Format B: dd/mm/yy hh.mm - Name: message
const PATTERN_A = /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}[.:]\d{2}(?:[.:]\d{2})?(?:\s*[AP]M)?)\]\s*([^:]+?):\s*([\s\S]*)$/;
const PATTERN_B = /^(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}[.:]\d{2}(?:[.:]\d{2})?(?:\s*[AP]M)?)\s*-\s*([^:]+?):\s*([\s\S]*)$/;

// System messages (no sender)
const PATTERN_SYS_A = /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}[.:]\d{2}(?:[.:]\d{2})?(?:\s*[AP]M)?)\]\s*([\s\S]+)$/;
const PATTERN_SYS_B = /^(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}[.:]\d{2}(?:[.:]\d{2})?(?:\s*[AP]M)?)\s*-\s*([\s\S]+)$/;

// Hidden unicode characters to clean
const HIDDEN_UNICODE = /[\u200E\u200F\u202A\u202B\u202C\u202D\u202E\uFEFF\u00A0]/g;

// Deleted message patterns
const DELETED_PATTERNS = [
  /pesan ini telah dihapus/i,
  /you deleted this message/i,
  /this message was deleted/i,
  /message deleted/i,
];

// Media attachment patterns
const MEDIA_PATTERNS = {
  image: /\.(jpg|jpeg|png|gif|bmp|heic)$/i,
  video: /\.(mp4|mov|avi|mkv|3gp)$/i,
  sticker: /\.(webp)$/i,
  document: /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|txt|apk)$/i,
  audio: /\.(mp3|ogg|opus|aac|m4a|wav|amr)$/i,
};

// File attachment line patterns
const ATTACHMENT_LINE = /^(.*?)\s*[\(\<]file terlampir[\)\>]$/i;
const ATTACHMENT_OMITTED = /<Media omitted>/i;
const ATTACHMENT_OMITTED_ID = /\(file terlampir\)/i;

function cleanText(text) {
  return text.replace(HIDDEN_UNICODE, '').trim();
}

function detectMediaType(filename) {
  if (!filename) return 'unknown';
  for (const [type, pattern] of Object.entries(MEDIA_PATTERNS)) {
    if (pattern.test(filename)) return type;
  }
  return 'document';
}

function isDeleted(text) {
  return DELETED_PATTERNS.some((p) => p.test(text));
}

function extractFilename(text) {
  // Try to match "filename.ext (file terlampir)" or just "filename.ext"
  const match = text.match(ATTACHMENT_LINE);
  if (match) return cleanText(match[1]);

  // Might be just a filename with known extension
  const parts = text.trim().split('\n')[0].trim();
  if (/\.\w{2,5}$/.test(parts) && !parts.includes(' ')) return parts;

  return null;
}

function parseMessageType(text) {
  const cleaned = cleanText(text);

  if (isDeleted(cleaned)) {
    return { type: 'deleted', content: cleaned, filename: null };
  }

  if (ATTACHMENT_OMITTED.test(cleaned) || ATTACHMENT_OMITTED_ID.test(cleaned)) {
    const filename = extractFilename(cleaned);
    if (filename) {
      const mediaType = detectMediaType(filename);
      return { type: mediaType, content: cleaned, filename };
    }
    return { type: 'media_omitted', content: cleaned, filename: null };
  }

  // Check if line contains a filename-like pattern
  const filename = extractFilename(cleaned);
  if (filename) {
    const mediaType = detectMediaType(filename);
    if (mediaType !== 'unknown') {
      return { type: mediaType, content: cleaned, filename };
    }
  }

  return { type: 'text', content: cleaned, filename: null };
}

function tryParseMessageLine(line) {
  const cleaned = cleanText(line);

  let match = cleaned.match(PATTERN_A);
  if (match) {
    return {
      date: match[1],
      time: match[2],
      sender: cleanText(match[3]),
      raw: match[4],
      isSystem: false,
    };
  }

  match = cleaned.match(PATTERN_B);
  if (match) {
    return {
      date: match[1],
      time: match[2],
      sender: cleanText(match[3]),
      raw: match[4],
      isSystem: false,
    };
  }

  // System messages
  match = cleaned.match(PATTERN_SYS_A);
  if (match) {
    return {
      date: match[1],
      time: match[2],
      sender: null,
      raw: match[3],
      isSystem: true,
    };
  }

  match = cleaned.match(PATTERN_SYS_B);
  if (match) {
    return {
      date: match[1],
      time: match[2],
      sender: null,
      raw: match[3],
      isSystem: true,
    };
  }

  return null;
}

/**
 * Main parse function
 * @param {string} rawText - raw content of the .txt file
 * @returns {{ messages: Array, participants: string[] }}
 */
function parseChat(rawText) {
  const lines = rawText.split('\n');
  const messages = [];
  const participantSet = new Set();

  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const parsed = tryParseMessageLine(line);

    if (parsed) {
      // Save previous message
      if (current) {
        const msgInfo = parseMessageType(current.raw);
        messages.push({
          id: messages.length,
          date: current.date,
          time: current.time,
          sender: current.sender,
          isSystem: current.isSystem,
          ...msgInfo,
        });
      }
      current = { ...parsed };
    } else {
      // Continuation of previous message (multi-line)
      if (current) {
        current.raw += '\n' + line;
      }
      // Else: lines before first message (e.g. encryption notice)
    }
  }

  // Push last message
  if (current) {
    const msgInfo = parseMessageType(current.raw);
    messages.push({
      id: messages.length,
      date: current.date,
      time: current.time,
      sender: current.sender,
      isSystem: current.isSystem,
      ...msgInfo,
    });
  }

  // Collect participants (non-system, non-null senders)
  for (const msg of messages) {
    if (msg.sender && !msg.isSystem) {
      participantSet.add(msg.sender);
    }
  }

  return {
    messages,
    participants: [...participantSet],
  };
}

module.exports = { parseChat };
