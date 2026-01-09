# YouTube Transcriber Chrome Extension

A production-ready Chrome extension that transcribes YouTube videos using Whisper AI. Supports **FREE local transcription** or OpenAI's Whisper API.

## Features

- 🎬 **Automatic YouTube Detection** - Detects video ID from various URL formats
- 🎤 **Local Whisper Transcription** - FREE, runs entirely on your machine
- 🌐 **OpenAI API Support** - Optional cloud transcription
- 📝 **Timestamped Transcriptions** - Optional timestamps for each segment
- 🔍 **Search & Highlight** - Search within transcriptions with highlighting
- 📋 **One-Click Copy** - Copy transcription to clipboard instantly
- 💾 **Multiple Export Formats** - Download as TXT, SRT, or VTT
- 🌗 **Dark/Light Mode** - Automatically matches system preference
- ⌨️ **Keyboard Shortcuts** - T=Transcribe, C=Copy, F=Search
- 🗃️ **Caching** - Cached transcriptions avoid re-processing

## Quick Start

### Prerequisites

```bash
# macOS (using Homebrew)
brew install yt-dlp ffmpeg
brew install pipx && pipx ensurepath
pipx install openai-whisper
```

### 1. Start the Backend Server

```bash
cd server
npm install   # First time only
npm start
```

You should see:

```
Mode:       LOCAL
Cost:       FREE! 🎉
```

### 2. Load the Chrome Extension

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `yt-transcription` folder

### 3. Use It!

1. Navigate to any YouTube video
2. Click the extension icon (side panel opens)
3. Click **Transcribe Video**
4. Wait for transcription (first run downloads the model)
5. Copy or download the result!

## Transcription Modes

### Local Mode (Default - FREE!)

Runs Whisper directly on your Mac. No API key needed, no costs.

```bash
# Uses 'base' model by default
npm start

# Use a different model
WHISPER_MODEL=small npm start
WHISPER_MODEL=medium npm start
```

| Model  | Speed   | Accuracy | Download |
| ------ | ------- | -------- | -------- |
| tiny   | Fastest | Basic    | ~75MB    |
| base   | Fast    | Good     | ~140MB   |
| small  | Medium  | Better   | ~460MB   |
| medium | Slow    | Great    | ~1.5GB   |
| large  | Slowest | Best     | ~3GB     |

### API Mode (Requires OpenAI Key)

Use OpenAI's cloud API instead ($0.006/minute):

```bash
WHISPER_MODE=api npm start
```

Then add your API key in the extension settings.

## Keyboard Shortcuts

| Key   | Action               |
| ----- | -------------------- |
| `T`   | Start transcription  |
| `C`   | Copy transcription   |
| `F`   | Focus search input   |
| `Esc` | Close settings panel |

## Server Endpoints

| Endpoint         | Method | Description                |
| ---------------- | ------ | -------------------------- |
| `/health`        | GET    | Health check & mode info   |
| `/check-deps`    | GET    | Verify yt-dlp & Whisper    |
| `/video-info`    | POST   | Get YouTube video metadata |
| `/transcribe`    | POST   | Extract audio & transcribe |
| `/estimate-cost` | POST   | Cost estimate              |

## Troubleshooting

### "whisper not found"

```bash
# Add to PATH
export PATH="$HOME/.local/bin:$PATH"

# Or reinstall
pipx install openai-whisper
```

### "yt-dlp not found"

```bash
brew install yt-dlp
```

### First transcription is slow

The first run downloads the Whisper model. Subsequent runs are much faster.

### Extension not detecting video

- Refresh the YouTube page
- Make sure you're on a video page (not homepage)

## Privacy & Security

- **100% Local Processing** - Audio never leaves your machine (in local mode)
- **No Data Collection** - Extension doesn't collect any data
- **Open Source** - Full source code available for review

## Credits

- [OpenAI Whisper](https://github.com/openai/whisper) - Speech recognition model
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - YouTube download tool
- [Chrome Extension APIs](https://developer.chrome.com/docs/extensions/)
