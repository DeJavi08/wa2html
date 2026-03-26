/**
 * media.js
 * Handles media file matching, copying, size scanning, and Google Drive fallback
 */

const fs = require('fs');
const path = require('path');

const SIZE_THRESHOLDS = {
  SAFE: 25 * 1024 * 1024,       // 25 MB
  WARNING: 50 * 1024 * 1024,    // 50 MB
  HARD_WARNING: 100 * 1024 * 1024, // 100 MB
};

/**
 * Scan a directory and return all files (flat, recursive)
 */
function scanDirectory(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  function walk(current) {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        results.push({
          name: entry.name,
          fullPath: full,
          size: fs.statSync(full).size,
        });
      }
    }
  }

  walk(dir);
  return results;
}

/**
 * Build a lookup map: normalized filename -> full path + size
 */
function buildMediaMap(sourceDir) {
  const files = scanDirectory(sourceDir);
  const map = new Map();
  for (const f of files) {
    map.set(f.name.toLowerCase().trim(), f);
    map.set(f.name.trim(), f);
  }
  return map;
}

/**
 * Get size category for a file
 */
function getSizeCategory(bytes) {
  if (bytes > SIZE_THRESHOLDS.HARD_WARNING) return 'alert';
  if (bytes > SIZE_THRESHOLDS.WARNING) return 'hard_warning';
  if (bytes > SIZE_THRESHOLDS.SAFE) return 'warning';
  return 'safe';
}

/**
 * Format bytes to human readable
 */
function formatSize(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(1) + 'GB';
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + 'KB';
  return bytes + 'B';
}

/**
 * Match message filenames to actual media files
 * Returns: { found: Map<filename, fileInfo>, missing: string[] }
 */
function matchMedia(messages, mediaMap) {
  const found = new Map();
  const missing = [];

  for (const msg of messages) {
    if (!msg.filename) continue;
    const key = msg.filename.trim();
    const keyLower = key.toLowerCase();

    if (mediaMap.has(key)) {
      found.set(key, mediaMap.get(key));
    } else if (mediaMap.has(keyLower)) {
      found.set(key, mediaMap.get(keyLower));
    } else {
      if (!missing.includes(key)) missing.push(key);
    }
  }

  return { found, missing };
}

/**
 * Scan and report file sizes
 * Returns array of { filename, size, category }
 */
function scanFileSizes(found) {
  const results = [];
  for (const [filename, fileInfo] of found.entries()) {
    const category = getSizeCategory(fileInfo.size);
    results.push({
      filename,
      size: fileInfo.size,
      sizeFormatted: formatSize(fileInfo.size),
      category,
      fullPath: fileInfo.fullPath,
    });
  }
  return results.sort((a, b) => b.size - a.size);
}

/**
 * Copy media files to output /media/ directory
 * Returns: Map<filename, outputRelativePath>
 */
function copyMediaFiles(found, outputMediaDir) {
  if (!fs.existsSync(outputMediaDir)) {
    fs.mkdirSync(outputMediaDir, { recursive: true });
  }

  const pathMap = new Map();

  for (const [filename, fileInfo] of found.entries()) {
    const dest = path.join(outputMediaDir, filename);
    try {
      fs.copyFileSync(fileInfo.fullPath, dest);
      pathMap.set(filename, `media/${filename}`);
    } catch (e) {
      console.error(`  [!] Failed to copy ${filename}: ${e.message}`);
    }
  }

  return pathMap;
}

/**
 * Convert Google Drive share link to embed/preview link
 */
function convertGDriveLink(link) {
  // Extract file ID from various Drive URL formats
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /id=([a-zA-Z0-9_-]+)/,
    /\/d\/([a-zA-Z0-9_-]+)/,
  ];

  for (const pattern of patterns) {
    const match = link.match(pattern);
    if (match) {
      return `https://drive.google.com/file/d/${match[1]}/preview`;
    }
  }

  return link; // Return as-is if can't parse
}

module.exports = {
  buildMediaMap,
  matchMedia,
  scanFileSizes,
  copyMediaFiles,
  convertGDriveLink,
  getSizeCategory,
  formatSize,
};
