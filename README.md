<p align="center">
  <img src="codebase/extension/spoken-logo.png" alt="Spoken Logo" width="120" height="120">
</p>

<h1 align="center">Spoken</h1>

<p align="center">
  <strong>AI-powered YouTube transcription at your fingertips.</strong><br>
  Fast, accurate, timestamped — directly in your browser.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Chrome-Extension-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white" alt="Chrome Extension">
  <img src="https://img.shields.io/badge/Manifest-V3-34A853?style=for-the-badge&logo=google-chrome&logoColor=white" alt="Manifest V3">
  <img src="https://img.shields.io/badge/Whisper-AI-FF6B6B?style=for-the-badge&logo=openai&logoColor=white" alt="Whisper AI">
  <img src="https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge" alt="MIT License">
</p>

---

## 🎯 Overview

**Spoken** is a privacy-focused Chrome extension that transcribes YouTube videos using state-of-the-art AI. It supports **free local transcription** using OpenAI's open-source Whisper model, or cloud-based transcription via **OpenAI Whisper API** and **Deepgram API**.

### Why Spoken?

- 🔒 **Privacy First** — Local mode processes everything on your machine
- 💰 **Free Option** — No API costs with local Whisper transcription
- ⚡ **Real-time Progress** — Live status updates during transcription
- 🌍 **Multi-language** — Supports 25+ languages with auto-detection
- 📱 **Modern UI** — Clean sidepanel interface with dark/light mode

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🎬 **Auto YouTube Detection** | Automatically detects videos from various URL formats (watch, shorts, embed) |
| 🎤 **Local Whisper** | FREE transcription using local Whisper model — no API key needed |
| 🌐 **Cloud APIs** | Optional OpenAI Whisper ($0.006/min) or Deepgram (~$0.0043/min) |
| 📝 **Timestamps** | Optional timestamps for each segment |
| 🔍 **Search & Highlight** | Full-text search within transcriptions with highlighting |
| 📋 **One-Click Copy** | Copy transcription to clipboard instantly |
| 💾 **Export Formats** | Download as TXT, SRT, or VTT subtitles |
| 🌗 **Dark/Light Mode** | Automatically matches your system preference |
| ⌨️ **Keyboard Shortcuts** | T=Transcribe, C=Copy, F=Search, Esc=Close |
| 🗃️ **Smart Caching** | Cached transcriptions avoid re-processing |
| 📤 **Audio Upload** | Transcribe local audio files directly |

---

## 🚀 Quick Start

### Prerequisites

Before running Spoken, install the required system dependencies:

```bash
# macOS (using Homebrew)
brew install yt-dlp ffmpeg

# For LOCAL transcription mode (free!)
brew install pipx && pipx ensurepath
pipx install openai-whisper
```

<details>
<summary><strong>Linux Installation</strong></summary>

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install ffmpeg
pip install yt-dlp

# For LOCAL transcription mode
pip install openai-whisper
```

</details>

<details>
<summary><strong>Windows Installation</strong></summary>

```powershell
# Using winget
winget install yt-dlp
winget install ffmpeg

# For LOCAL transcription mode
pip install openai-whisper
```

</details>

### 1. Clone the Repository

```bash
git clone https://github.com/mujtabamohamed/spoken.git
cd spoken
```

### 2. Start the Backend Server

```bash
cd codebase/server
npm install   # First time only
npm start
```

You should see:

```
═══════════════════════════════════════════════════════════════
  Spoken Backend Server
═══════════════════════════════════════════════════════════════
  Status:     Running
  Port:       3456
  Mode:       LOCAL
  Model:      base
  Cost:       FREE! 🎉
```

### 3. Load the Chrome Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select the `codebase/extension` folder

### 4. Start Transcribing!

1. Navigate to any YouTube video
2. Click the Spoken extension icon → Opens sidepanel
3. Click **Transcribe**
4. Wait for the magic! ✨

---

## ⚙️ Configuration

### Transcription Modes

Spoken supports three transcription modes:

#### 🖥️ Local Mode (Default — FREE!)

Runs Whisper directly on your machine. No API key needed, no costs.

```bash
# Start with default 'base' model
npm start

# Use a different model for better accuracy
WHISPER_MODEL=small npm start
WHISPER_MODEL=medium npm start
WHISPER_MODEL=large npm start
```

| Model | Speed | Accuracy | VRAM | Download Size |
|-------|-------|----------|------|---------------|
| `tiny` | Fastest | Basic | ~1GB | ~75MB |
| `base` | Fast | Good | ~1GB | ~140MB |
| `small` | Medium | Better | ~2GB | ~460MB |
| `medium` | Slow | Great | ~5GB | ~1.5GB |
| `large` | Slowest | Best | ~10GB | ~3GB |

#### ☁️ OpenAI API Mode

Use OpenAI's cloud API for transcription (~$0.006/minute):

```bash
WHISPER_MODE=api npm start
```

Then add your API key in the extension settings.

#### ☁️ Deepgram API Mode ($200 worth free credits)

Use Deepgram's API for faster, cost-effective transcription (~$0.0043/minute):

1. Start the server in API mode: `WHISPER_MODE=api npm start`
2. In the extension settings, select **Deepgram** as the provider
3. Add your Deepgram API key

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3456` | Server port |
| `WHISPER_MODE` | `local` | `local` or `api` |
| `WHISPER_MODEL` | `base` | Local Whisper model size |

---

## 🗂️ Project Structure

```
spoken/
├── README.md                 # This file
├── logo/                     # Brand assets
└── codebase/
    ├── extension/            # Chrome extension
    │   ├── manifest.json     # Extension configuration
    │   ├── background.js     # Service worker
    │   ├── content.js        # YouTube page detection
    │   ├── sidepanel.html    # Side panel UI
    │   ├── sidepanel.js      # UI logic
    │   ├── sidepanel.css     # Styles
    │   ├── api.js            # Whisper API client
    │   ├── utils.js          # Utility functions
    │   └── icons/            # Extension icons
    └── server/               # Backend server
        ├── package.json      # Dependencies
        └── server.js         # yt-dlp + Whisper integration
```

---

## 🔌 API Reference

### Server Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | `GET` | Health check & mode info |
| `/check-deps` | `GET` | Verify yt-dlp & Whisper installation |
| `/video-info` | `POST` | Get YouTube video metadata |
| `/transcribe` | `POST` | Extract audio & transcribe (SSE) |
| `/estimate-cost` | `POST` | Cost estimate for API mode |

### Example: Transcribe Request

```bash
curl -X POST http://localhost:3456/transcribe \
  -H "Content-Type: application/json" \
  -H "X-Mode: local" \
  -d '{"url": "https://www.youtube.com/watch?v=VIDEO_ID"}'
```

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `T` | Start transcription |
| `C` | Copy transcription to clipboard |
| `F` | Focus search input |
| `Esc` | Close settings panel |

---

## 🌍 Supported Languages

Spoken supports 25+ languages for transcription:

- **European**: English, Spanish, French, German, Italian, Portuguese, Dutch, Polish, Russian, Ukrainian, Czech, Swedish, Danish, Finnish, Norwegian, Greek, Romanian, Hungarian
- **Asian**: Arabic, Chinese, Hebrew, Hindi, Indonesian, Japanese, Korean, Persian, Thai, Vietnamese, Turkish, Urdu

---

## 🛠️ Troubleshooting

<details>
<summary><strong>❌ "whisper not found"</strong></summary>

```bash
# Ensure path is set correctly
export PATH="$HOME/.local/bin:$PATH"

# Reinstall whisper
pipx install openai-whisper

# Or use pip
pip install --user openai-whisper
```

</details>

<details>
<summary><strong>❌ "yt-dlp not found"</strong></summary>

```bash
# macOS
brew install yt-dlp

# Linux
pip install yt-dlp

# Windows
winget install yt-dlp
```

</details>

<details>
<summary><strong>⏳ First transcription is slow</strong></summary>

The first run downloads the Whisper model to `~/.cache/whisper/`. This is a one-time download. Subsequent transcriptions are much faster.

</details>

<details>
<summary><strong>🔴 Extension not detecting video</strong></summary>

1. Refresh the YouTube page
2. Make sure you're on a video page (not homepage/search)
3. Check if the server is running (`http://localhost:3456/health`)

</details>

<details>
<summary><strong>❌ API key errors</strong></summary>

- **OpenAI**: Get your key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- **Deepgram**: Get your key at [console.deepgram.com](https://console.deepgram.com)
- Ensure your key has sufficient credits

</details>

---

## 🤝 Contributing

We love contributions! Here's how to get started:

### Development Setup

1. **Fork & Clone**
   ```bash
   git clone https://github.com/mujtabamohamed/spoken.git
   cd spoken
   ```

2. **Install Dependencies**
   ```bash
   cd codebase/server
   npm install
   ```

3. **Start Development Server**
   ```bash
   npm run dev   # Enables auto-reload on file changes
   ```

4. **Load Extension in Chrome**
   - Go to `chrome://extensions/`
   - Enable Developer mode
   - Click "Load unpacked" → Select `/extension`

### Making Changes

1. **Create a Branch**
   ```bash
   git checkout -b feature/your-awesome-feature
   ```

2. **Make Your Changes**
   - Extension code: `/extension`
   - Server code: `/server`

3. **Test Thoroughly**
   - Test with local mode
   - Test with API mode (if applicable)
   - Test on different video types (shorts, regular, live)

4. **Submit a Pull Request**
   - Write a clear description of your changes
   - Reference any related issues

### Contribution Guidelines

- 📝 Follow existing code style
- 💬 Write clear commit messages
- 🧪 Test your changes thoroughly
- 📖 Update documentation if needed
- 🎯 Keep PRs focused and atomic

### Areas We'd Love Help With

- 🎨 **UI/UX** — Design improvements
- 🐛 **Bug Fixes** — Check out open issues
- ✨ **Features** — New export formats, integrations
- 📚 **Documentation** — Improve guides and examples

---

## 🔒 Privacy & Security

Spoken is designed with privacy in mind:

| Mode | Where Processing Happens | Data Sent Externally |
|------|-------------------------|---------------------|
| **Local** | 100% on your machine | None |
| **OpenAI API** | OpenAI servers | Audio only |
| **Deepgram API** | Deepgram servers | Audio only |

- ✅ **No Analytics** — We don't collect any usage data
- ✅ **No Tracking** — No cookies, no fingerprinting
- ✅ **Open Source** — Full code available for audit
- ✅ **No Account Needed** — Works without sign-up

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

## 🙏 Credits & Acknowledgments

- [OpenAI Whisper](https://github.com/openai/whisper) — State-of-the-art speech recognition
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) — YouTube audio extraction
- [Deepgram](https://deepgram.com) — Fast, accurate speech-to-text API
- [Chrome Extension APIs](https://developer.chrome.com/docs/extensions/)

---

<p align="center">
  <a href="https://github.com/mujtabamohamed/spoken/issues">Report Bug</a>
  ·
  <a href="https://github.com/mujtabamohamed/spoken/issues">Request Feature</a>
</p>
