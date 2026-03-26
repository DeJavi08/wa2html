# WhatsApp to HTML Builder

Convert WhatsApp chat exports (`.zip` or `.txt`) into static HTML + media files, ready to be served by a static web viewer.

## Requirements

- Node.js >= 16
- npm

## Installation

```bash
npm install
```

## Usage

```bash
node index.js
```

Place your `.zip` or `.txt` WhatsApp export in the same folder, then run the command. The CLI will guide you through:

1. **Selecting the input file** — auto-detects `.zip` and `.txt` in the current directory
2. **Extraction** — if `.zip`, automatically extracts and locates the chat `.txt`
3. **Parsing** — reads all messages with date, time, sender, content, and media type
4. **Media matching** — matches media filenames mentioned in chat to actual files
5. **Size scanning** — warns about files >25MB, alerts for >100MB
6. **Google Drive fallback** — optionally replace large files with a Google Drive preview link
7. **"Me" selection** — choose which participant is "you" (determines left/right bubbles in viewer)
8. **Output generation** — creates `chat.html`, `config.json`, and `media/` folder

## Output Structure

```
output/
└── chat-name/
    ├── chat.html      ← all messages, pre-rendered HTML
    ├── config.json    ← metadata: me, participants, chatName
    └── media/
        ├── IMG-001.jpg
        ├── VID-001.mp4
        └── ...
```

### config.json format

```json
{
  "me": "Alice",
  "participants": ["Alice", "Bob"],
  "chatName": "chat-name",
  "generatedAt": "2024-01-01T00:00:00.000Z",
  "totalMessages": 1234
}
```

## Supported Message Types

| Type | Detection | Output |
|------|-----------|--------|
| Text | Regular message | Text bubble |
| Image | `.jpg`, `.png`, `.gif`, `.heic` | `<img>` with click-to-expand |
| Video | `.mp4`, `.mov`, `.3gp` | `<video controls>` |
| Audio | `.opus`, `.mp3`, `.ogg`, `.m4a` | `<audio controls>` |
| Sticker | `.webp` | `<img class="sticker">` |
| Document | `.pdf`, `.doc`, `.xls`, etc. | Download link |
| Google Drive | Any (via fallback) | `<iframe>` embed |
| Deleted | "Pesan ini telah dihapus" | Placeholder text |
| Media omitted | `(file terlampir)` with no match | "Media not found" notice |

## Supported Chat Formats

- `[dd/mm/yy, hh.mm] Name: message` (WhatsApp Android with brackets)
- `dd/mm/yy hh.mm - Name: message` (WhatsApp Android without brackets)
- Multi-line messages supported
- Hidden unicode characters (LRM, etc.) automatically cleaned

## Running Tests

```bash
node test.js
```

## File Structure

```
index.js      — CLI entry point & orchestrator
parser.js     — Chat text parser
media.js      — Media matching, size scanning, file copying
generator.js  — HTML & config.json output
test.js       — Unit tests
package.json
README.md
```

## Viewer Compatibility

The output is designed for a separate static viewer. The viewer should:
- Load `config.json` to determine `me`
- Apply `.me` or `.other` class to `.message[data-sender]` elements based on `config.me`
- Serve the folder statically (GitHub Pages, Netlify, Vercel, etc.)
