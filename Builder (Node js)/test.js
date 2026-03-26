/**
 * test.js — Basic unit tests for parser & media modules
 */

const { parseChat } = require('./parser');
const { convertGDriveLink, formatSize, getSizeCategory } = require('./media');

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

// ─── PARSER TESTS ──────────────────────────────────────────────────────────────
console.log('\n[Parser Tests]');

const sampleA = `[01/01/24, 09.00] Alice: Halo!
[01/01/24, 09.01] Bob: Hai juga!
[01/01/24, 09.02] Alice: IMG-20240101-WA0001.jpg (file terlampir)
[01/01/24, 09.03] Bob: Pesan ini telah dihapus
[01/01/24, 09.04] Alice: Pesan
multi baris
ini`;

const resultA = parseChat(sampleA);
assert('Format A - parsed 5 messages', resultA.messages.length === 5);
assert('Format A - 2 participants', resultA.participants.length === 2);
assert('Format A - participants include Alice', resultA.participants.includes('Alice'));
assert('Format A - first msg is text', resultA.messages[0].type === 'text');
assert('Format A - image detected', resultA.messages[2].type === 'image');
assert('Format A - image filename', resultA.messages[2].filename === 'IMG-20240101-WA0001.jpg');
assert('Format A - deleted detected', resultA.messages[3].type === 'deleted');
assert('Format A - multiline message', resultA.messages[4].content.includes('multi baris'));

const sampleB = `01/01/24 09.00 - Charlie: Halo!
01/01/24 09.01 - Diana: Selamat pagi
01/01/24 09.02 - Charlie: VID-20240101-WA0001.mp4 (file terlampir)
01/01/24 09.03 - Diana: document.pdf (file terlampir)`;

const resultB = parseChat(sampleB);
assert('Format B - parsed 4 messages', resultB.messages.length === 4);
assert('Format B - 2 participants', resultB.participants.length === 2);
assert('Format B - video detected', resultB.messages[2].type === 'video');
assert('Format B - document detected', resultB.messages[3].type === 'document');

// Edge: hidden unicode
const sampleUni = `[01/01/24, 10.00] \u200EAlice\u200F: Test unicode\u200E`;
const resultUni = parseChat(sampleUni);
assert('Unicode - sender cleaned', resultUni.messages[0].sender === 'Alice');
assert('Unicode - content cleaned', resultUni.messages[0].content === 'Test unicode');

// ─── MEDIA TESTS ───────────────────────────────────────────────────────────────
console.log('\n[Media Tests]');

assert('formatSize bytes', formatSize(512) === '512B');
assert('formatSize KB', formatSize(2048) === '2.0KB');
assert('formatSize MB', formatSize(5 * 1024 * 1024) === '5.0MB');
assert('formatSize GB', formatSize(2 * 1024 * 1024 * 1024) === '2.0GB');

assert('getSizeCategory safe', getSizeCategory(10 * 1024 * 1024) === 'safe');
assert('getSizeCategory warning', getSizeCategory(30 * 1024 * 1024) === 'warning');
assert('getSizeCategory hard_warning', getSizeCategory(60 * 1024 * 1024) === 'hard_warning');
assert('getSizeCategory alert', getSizeCategory(110 * 1024 * 1024) === 'alert');

const gdrive1 = 'https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/view?usp=sharing';
const converted1 = convertGDriveLink(gdrive1);
assert('GDrive link conversion (file/d)', converted1 === 'https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/preview');

const gdrive2 = 'https://drive.google.com/open?id=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs';
const converted2 = convertGDriveLink(gdrive2);
assert('GDrive link conversion (open?id)', converted2 === 'https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/preview');

// ─── STICKER TEST ──────────────────────────────────────────────────────────────
console.log('\n[Sticker/Audio Tests]');
const sampleSticker = `[01/01/24, 10.00] Alice: STK-20240101-WA0001.webp (file terlampir)
[01/01/24, 10.01] Bob: AUD-20240101-WA0001.opus (file terlampir)`;
const resultSticker = parseChat(sampleSticker);
assert('Sticker detected', resultSticker.messages[0].type === 'sticker');
assert('Audio detected', resultSticker.messages[1].type === 'audio');

// ─── SUMMARY ──────────────────────────────────────────────────────────────────
console.log(`\n─────────────────────────────`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
