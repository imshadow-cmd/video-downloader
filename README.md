# VaultDL — Universal Video Downloader

Zero-storage streaming video/audio downloader powered by **yt-dlp** + **FFmpeg**, deployable on Railway.app.

## Architecture

```
Client Request
    │
    ▼
Express Server (Node.js)
    │
    ├─ POST /api/metadata  ──► yt-dlp --dump-json ──► JSON response
    │
    └─ GET /api/download
         │
         ├─ mp4_hd   ──► yt-dlp(video) ─┐
         │                               ├─► ffmpeg merge ──► HTTP stream
         │             yt-dlp(audio) ────┘
         │
         ├─ mp4_360p ──► yt-dlp(360p) ──► ffmpeg remux ──► HTTP stream
         │
         └─ mp3      ──► yt-dlp(audio) ──► ffmpeg MP3 ──► HTTP stream
```

**No files are written to disk.** All processing is done via Unix pipes / Node.js streams.

## Deploy on Railway

### Option 1: GitHub repo
1. Push this project to GitHub
2. Create new Railway project → "Deploy from GitHub repo"
3. Railway auto-detects the `Dockerfile` and builds it
4. Access via the generated `*.railway.app` domain

### Option 2: Railway CLI
```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

## Local Development

### Prerequisites
- Node.js 18+
- Python 3 + pip
- ffmpeg (`brew install ffmpeg` / `apt install ffmpeg`)
- yt-dlp (`pip install yt-dlp`)

### Run
```bash
npm install
node server.js
# Open http://localhost:3000
```

## API Reference

### POST /api/metadata
```json
// Request body
{ "url": "https://www.youtube.com/watch?v=..." }

// Response
{
  "title": "Video Title",
  "thumbnail": "https://...",
  "duration": 312,
  "duration_string": "5:12",
  "uploader": "Channel Name",
  "view_count": 1234567,
  "formats": [...]
}
```

### GET /api/download
```
/api/download?url=<URL>&format=mp4_hd&title=MyVideo

format options:
  mp4_hd    — Best quality video + audio merged (1080p+)
  mp4_360p  — 360p compact MP4
  mp3       — Audio only, 192kbps MP3
```

### GET /health
Returns `{ "status": "ok" }` — used by Railway healthcheck.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP server port (Railway sets this automatically) |
| `YTDLP_PATH` | `yt-dlp` | Path to yt-dlp binary |
| `FFMPEG_PATH` | `ffmpeg` | Path to ffmpeg binary |
| `NODE_ENV` | — | Set to `production` to suppress verbose logs |

## Notes & Limitations

- HD merge streams can be large and slow depending on video length
- Railway's free tier has limited CPU/RAM — works best for short clips
- Some platforms (YouTube) may require cookies or proxy for certain videos
- Respect the terms of service of each platform you use this with
