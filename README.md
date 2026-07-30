# ScribeNode — AI Speech & Transcript Engine

[![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)](package.json)
[![Node](https://img.shields.io/badge/node-v26%2B-brightgreen.svg)](package.json)
[![Docker](https://img.shields.io/badge/docker-v1.1.0-blue.svg)](Dockerfile)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

**ScribeNode** is a full-stack, high-throughput AI audio transcription and speech intelligence web application. Powered by Google's Gemini Flash AI model suite, ScribeNode transforms raw podcast recordings, meeting audio, interviews, and voice notes into polished clean-verbatim transcripts, structured chapters, executive summaries, and actionable key takeaways.

---

## Key Features

- 🎧 **Broad Format Support**: Transcribe MP3, WAV, M4A, OGG, and FLAC audio files up to 100MB.
- ⚡ **Clean Verbatim Transcription**: Specialized prompting removes speech disfluencies, filler words (*uh*, *um*, *like*), stutters, and false starts while preserving technical domain terms.
- 👥 **Speaker Diarization & Name Detection**: Contextually identifies speaker names and formats dialogue seamlessly with bold speaker labels and timestamps.
- 📌 **Automated Chaptering & Intelligence**: Generates timestamped chapters, high-level summaries, key bulleted takeaways, and actionable next steps.
- 🔍 **Interactive Live Viewer & Audio Sync**: Live transcript filtering, full-text search, jump-to-timestamp playback, and text-selection inspection.
- 📥 **Export & Sharing Options**: Download transcripts and intelligence assets in Markdown (`.md`) or Plain Text (`.txt`), with instant copy-to-clipboard support.
- 🔒 **Private Homelab & Basic Auth Ready**: Native support for HTTP Basic Authentication and Docker containerization for secure private self-hosting.

---

## Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React 19, Vite 8, Tailwind CSS v4, Lucide React Icons, Motion v12 |
| **Backend** | Node.js (v26 / v22+), Express 5, Multer File Upload |
| **AI Engine** | Google Gen AI SDK (`@google/genai`), Gemini 3.6 Flash / 3.5 Flash |
| **Bundler & Build** | ESBuild (Node CJS bundling), Vite 8 |
| **Container & CI/CD** | Docker (`node:26-alpine`), Docker Compose, GitHub Actions (v7), GHCR |

---

## Pipeline & Architecture

```
┌────────────────────────────┐     ┌────────────────────────────┐     ┌────────────────────────────┐
│        Audio Ingest        │ ──> │       Express Server       │ ──> │   Gemini Flash AI Engine   │
│     (MP3 / WAV / M4A)      │     │      (Multer / Stream)     │     │   (Clean Verbatim Model)   │
└────────────────────────────┘     └────────────────────────────┘     └────────────────────────────┘
                                                                                    │
                                                                                    ▼
┌────────────────────────────┐     ┌────────────────────────────┐     ┌────────────────────────────┐
│       Export & Share       │ <── │       Interactive UI       │ <── │    Diarized Transcript     │
│   (MD / TXT / Clipboard)   │     │    (React / Audio Sync)    │     │   + Chapters + Summaries   │
└────────────────────────────┘     └────────────────────────────┘     └────────────────────────────┘
```

1. **Upload & Ingestion**: Audio files are uploaded to the Express backend via streaming multipart forms.
2. **Model Cascade Pipeline**: The server routes audio payloads through Gemini 3.6 Flash, automatically failing over to Gemini 3.5 Flash or Flash Lite if rate limits or model changes occur.
3. **Structuring & Diarization**: The raw transcript is processed into timed segments with identified speaker labels and structured chapters.
4. **State Persistence**: Processing jobs, transcripts, chapters, and audio files are persisted to `/app/uploads/jobs.json` within the mounted volume (`scribenode_uploads`), preserving all transcript data across container restarts and rebuilds.

---

## Environment Configuration (`.env`)

To run ScribeNode, create a `.env` file in the root directory (or specify environment variables in Docker Compose).

### `.env` Example

```env
# 🔑 REQUIRED: Google Gemini API Key
# Get a key from Google AI Studio: https://aistudio.google.com/app/apikey
GEMINI_API_KEY="AIzaSyYourActualGeminiApiKeyHere"

# 🌐 OPTIONAL: Base URL of your app instance
# Default: http://localhost:3000
APP_URL="http://localhost:3000"

# 🔌 OPTIONAL: Container/Server Port
# Default: 3000 (Can be set to 4200, 8080, etc.)
PORT=3000

# 🏷️ OPTIONAL: Custom Page Title for Browser Tab
# Default: ScribeNode – Transcription Engine
APP_TITLE="ScribeNode – Transcription Engine"

# 🔒 OPTIONAL: Private HTTP Basic Authentication
# Basic Auth is FULLY DISABLED by default.
# To explicitly enable password protection, set BASIC_AUTH_ENABLED="true" and configure user/pass:
BASIC_AUTH_ENABLED="false"
BASIC_AUTH_USER="admin"
BASIC_AUTH_PASS="your_secure_password_here"
```

---

## Homelab & Self-Hosting with Docker Compose

ScribeNode is optimized for home lab deployment via Docker Compose using either local compilation or pre-built container images from **GitHub Container Registry (GHCR)**.

### Option A: Using `docker-compose.yml` (Recommended)

1. Save the following `docker-compose.yml` file to your server directory:

```yaml
services:
  scribenode:
    # Option 1: Pull pre-built image from GHCR (Replace with your repository name)
    image: ghcr.io/YOUR_GITHUB_USERNAME/YOUR_REPO_NAME:latest

    # Option 2: Or build locally from source code
    # build:
    #   context: .
    #   dockerfile: Dockerfile

    container_name: scribenode-app
    restart: unless-stopped
    ports:
      - "${PORT:-3000}:${PORT:-3000}"

    environment:
      - NODE_ENV=production
      - PORT=${PORT:-3000}
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - APP_URL=${APP_URL:-http://localhost:3000}
      - APP_TITLE=${APP_TITLE:-ScribeNode – Transcription Engine}
      - BASIC_AUTH_ENABLED=${BASIC_AUTH_ENABLED:-false}
      - BASIC_AUTH_USER=${BASIC_AUTH_USER:-}
      - BASIC_AUTH_PASS=${BASIC_AUTH_PASS:-}

    volumes:
      - scribenode_uploads:/app/uploads

volumes:
  scribenode_uploads:
```

2. Create a `.env` file alongside `docker-compose.yml`:

```env
GEMINI_API_KEY=AIzaSyYourActualGeminiApiKeyHere
PORT=4200
BASIC_AUTH_USER=admin
BASIC_AUTH_PASS=my_secure_password_123
```

3. Launch the container:

```bash
docker compose up -d
```

Your instance will now be live at `http://your-homelab-ip:4200` protected by HTTP Basic Authentication!

---

## Local Development Setup

### Prerequisites
- Node.js 22 or higher
- npm v10 or higher
- Google Gemini API Key

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
# Edit .env and supply your GEMINI_API_KEY

# Start dev server
npm run dev
```

Open `http://localhost:3000` in your browser.

---

## Production Build & Standalone Node Execution

To build the standalone single-file production CJS backend and static frontend bundle:

```bash
# Build the application
npm run build

# Run production server
npm run start
```

---

## GitHub Actions CI/CD Pipeline

The repository includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) that automatically:
- Validates type safety (`tsc --noEmit`) and lints code.
- Builds the production bundle.
- Compiles and pushes a multi-arch Docker image to **GitHub Container Registry (GHCR)** on every push to `main`/`master`.

To pull your private container image from GHCR on a homelab host:

```bash
echo "YOUR_GITHUB_PAT_OR_TOKEN" | docker login ghcr.io -u "YOUR_GITHUB_USERNAME" --password-stdin
docker compose pull && docker compose up -d
```

---

## License

Distributed under the MIT License. See `LICENSE` for more information.
