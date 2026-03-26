#!/usr/bin/env node
/**
 * index.js — WhatsApp to HTML Builder
 * Entry point & CLI orchestrator
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

const { parseChat } = require('./parser');
const { buildMediaMap, matchMedia, scanFileSizes, copyMediaFiles, convertGDriveLink } = require('./media');
const { generateOutput } = require('./generator');

// ─── COLORS ──────────────────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

function log(symbol, msg, color = c.green) {
  console.log(`${color}[${symbol}]${c.reset} ${msg}`);
}

function ok(msg) { log('✓', msg, c.green); }
function warn(msg) { log('!', msg, c.yellow); }
function err(msg) { log('✗', msg, c.red); }
function info(msg) { log('i', msg, c.cyan); }

// ─── READLINE HELPER ─────────────────────────────────────────────────────────
function createRL() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

// ─── FILE SELECTION ───────────────────────────────────────────────────────────
function listEligibleFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => /\.(zip|txt)$/i.test(f))
    .map((f) => ({ name: f, full: path.join(dir, f) }));
}

async function selectInputFile(rl) {
  const cwd = process.cwd();
  const files = listEligibleFiles(cwd);

  console.log();
  console.log(`${c.bold}WhatsApp to HTML Builder${c.reset}`);
  console.log(`${c.dim}────────────────────────────────${c.reset}`);
  console.log();

  if (files.length === 0) {
    info('Tidak ada file .zip atau .txt ditemukan di folder ini.');
    console.log();
    const manual = await ask(rl, 'Masukkan path file .zip atau .txt secara manual:\n> ');
    const trimmed = manual.trim().replace(/^['"]|['"]$/g, '');
    if (!fs.existsSync(trimmed)) {
      err('File tidak ditemukan: ' + trimmed);
      process.exit(1);
    }
    return trimmed;
  }

  info(`File ditemukan di: ${cwd}`);
  console.log();
  files.forEach((f, i) => {
    const size = fs.statSync(f.full).size;
    const sizeFmt = size > 1024 * 1024
      ? (size / (1024 * 1024)).toFixed(1) + ' MB'
      : (size / 1024).toFixed(1) + ' KB';
    console.log(`  ${c.cyan}[${i}]${c.reset} ${f.name} ${c.dim}(${sizeFmt})${c.reset}`);
  });
  console.log();

  const choice = await ask(rl, 'Pilih file (nomor) atau ketik path manual:\n> ');
  const idx = parseInt(choice.trim());

  if (!isNaN(idx) && idx >= 0 && idx < files.length) {
    return files[idx].full;
  }

  const manual = choice.trim().replace(/^['"]|['"]$/g, '');
  if (!fs.existsSync(manual)) {
    err('File tidak ditemukan: ' + manual);
    process.exit(1);
  }
  return manual;
}

// ─── ZIP EXTRACTION ───────────────────────────────────────────────────────────
async function extractZip(zipPath) {
  const AdmZip = requireAdmZip();
  const zip = new AdmZip(zipPath);
  const extractDir = zipPath.replace(/\.zip$/i, '_extracted_' + Date.now());
  fs.mkdirSync(extractDir, { recursive: true });
  zip.extractAllTo(extractDir, true);
  ok(`Extracted to: ${path.basename(extractDir)}`);
  return extractDir;
}

function requireAdmZip() {
  try {
    return require('adm-zip');
  } catch {
    err('adm-zip tidak terinstall. Jalankan: npm install adm-zip');
    process.exit(1);
  }
}

function findTxtInDir(dir) {
  const results = [];
  function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.txt$/i.test(entry.name)) results.push(full);
    }
  }
  walk(dir);
  return results;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  const rl = createRL();

  try {
    // 1. Select input file
    const inputFile = await selectInputFile(rl);
    const ext = path.extname(inputFile).toLowerCase();
    info(`File dipilih: ${path.basename(inputFile)}`);
    console.log();

    let txtFile = null;
    let mediaDir = null;

    // 2. Extract zip if needed
    if (ext === '.zip') {
      ok('Extracting zip...');
      const extractDir = await extractZip(inputFile);
      const txts = findTxtInDir(extractDir);

      if (txts.length === 0) {
        err('Tidak ada file .txt ditemukan dalam zip.');
        process.exit(1);
      }

      if (txts.length === 1) {
        txtFile = txts[0];
      } else {
        console.log('Beberapa file .txt ditemukan:');
        txts.forEach((t, i) => console.log(`  [${i}] ${path.basename(t)}`));
        const pick = await ask(rl, 'Pilih file chat (nomor):\n> ');
        txtFile = txts[parseInt(pick.trim())] || txts[0];
      }

      mediaDir = path.dirname(txtFile);
    } else {
      txtFile = inputFile;
      mediaDir = path.dirname(inputFile);
    }

    ok(`Reading chat file: ${path.basename(txtFile)}`);

    // 3. Read & parse chat
    const rawText = fs.readFileSync(txtFile, 'utf8');
    ok('Parsing messages...');
    const { messages, participants } = parseChat(rawText);

    if (messages.length === 0) {
      err('Tidak ada pesan yang bisa di-parse. Format tidak dikenali?');
      process.exit(1);
    }

    ok(`Found ${messages.length} messages, ${participants.length} participants`);

    // 4. Match media
    ok('Matching media files...');
    const mediaMap = buildMediaMap(mediaDir);
    const { found, missing } = matchMedia(messages, mediaMap);
    ok(`Media matched: ${found.size} file(s)`);
    if (missing.length > 0) {
      warn(`Media not found: ${missing.length} file(s)`);
      missing.forEach((m) => warn(`  → ${m}`));
    }

    // 5. Scan file sizes
    ok('Scanning file sizes...');
    const sizeReport = scanFileSizes(found);
    for (const f of sizeReport) {
      if (f.category === 'alert') {
        warn(`${c.red}ALERT${c.reset}: ${f.filename} (${f.sizeFormatted}) — >100MB`);
      } else if (f.category === 'hard_warning') {
        warn(`WARNING: ${f.filename} (${f.sizeFormatted}) — 50–100MB`);
      } else if (f.category === 'warning') {
        warn(`Besar: ${f.filename} (${f.sizeFormatted}) — 25–50MB`);
      }
    }

    // 6. Google Drive fallback for large files
    const driveMap = new Map();
    const largeFiles = sizeReport.filter((f) => f.category !== 'safe');

    if (largeFiles.length > 0) {
      console.log();
      console.log(`${c.yellow}Ada ${largeFiles.length} file berukuran besar:${c.reset}`);
      largeFiles.forEach((f) => console.log(`  • ${f.filename} (${f.sizeFormatted})`));
      console.log();

      for (const f of largeFiles) {
        console.log(`${c.bold}${f.filename}${c.reset} (${f.sizeFormatted})`);
        console.log('  [1] Tetap gunakan file lokal');
        console.log('  [2] Ganti dengan Google Drive link');
        const choice = await ask(rl, '  Pilih (1/2):\n  > ');

        if (choice.trim() === '2') {
          const link = await ask(rl, '  Masukkan Google Drive link:\n  > ');
          const previewLink = convertGDriveLink(link.trim());
          driveMap.set(f.filename, previewLink);
          ok(`Drive link diset untuk: ${f.filename}`);
          // Remove from found so it won't be copied
          found.delete(f.filename);
        }
        console.log();
      }
    }

    // 7. Identify "me"
    console.log();
    if (participants.length === 0) {
      err('Tidak ada peserta ditemukan.');
      process.exit(1);
    }

    console.log(`${c.bold}Siapa kamu dalam chat ini?${c.reset}`);
    participants.forEach((p, i) => console.log(`  ${c.cyan}[${i}]${c.reset} ${p}`));
    console.log();
    const mePick = await ask(rl, 'Masukkan nomor:\n> ');
    const meIdx = parseInt(mePick.trim());
    const me = participants[meIdx] !== undefined ? participants[meIdx] : participants[0];
    ok(`"Me" diset sebagai: ${me}`);

    // 8. Determine chat name & output dir
    const baseName = path.basename(txtFile, '.txt').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-_]/g, '');
    const chatName = baseName || 'chat';
    const outputDir = path.join(process.cwd(), 'output', chatName);
    const outputMediaDir = path.join(outputDir, 'media');

    fs.mkdirSync(outputDir, { recursive: true });
    fs.mkdirSync(outputMediaDir, { recursive: true });

    // 9. Copy media
    ok('Copying media files...');
    const mediaPathMap = copyMediaFiles(found, outputMediaDir);
    ok(`${mediaPathMap.size} media file(s) copied`);

    // 10. Generate HTML + config
    ok('Generating HTML...');
    generateOutput(outputDir, {
      messages,
      participants,
      me,
      chatName,
      mediaPathMap,
      driveMap,
    });

    // 11. Done!
    console.log();
    console.log(`${c.green}${c.bold}[✓] Done!${c.reset}`);
    console.log(`${c.dim}Output:${c.reset} ${outputDir}`);
    console.log();
    console.log('  Files generated:');
    console.log(`    ${c.cyan}chat.html${c.reset}   — pesan chat`);
    console.log(`    ${c.cyan}config.json${c.reset} — metadata & "me"`);
    console.log(`    ${c.cyan}media/${c.reset}      — file media`);
    console.log();

    // Summary
    const textCount = messages.filter((m) => m.type === 'text' && !m.isSystem).length;
    const mediaCount = messages.filter((m) => m.type !== 'text' && !m.isSystem).length;
    info(`Total: ${messages.filter((m) => !m.isSystem).length} pesan (${textCount} teks, ${mediaCount} media)`);
    info(`Participants: ${participants.join(', ')}`);
    info(`Me: ${me}`);

  } finally {
    rl.close();
  }
}

main().catch((e) => {
  err('Fatal error: ' + e.message);
  if (process.env.DEBUG) console.error(e);
  process.exit(1);
});
