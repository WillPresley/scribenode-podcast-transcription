# <img src="public/logos/scribenode-logo-color.svg" alt="ScribeNode Logo" width="38" height="38" valign="middle" /> ScribeNode — AI Speech & Transcript Engine

[![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)](package.json)
[![Node](https://img.shields.io/badge/node-v26%2B-brightgreen.svg)](package.json)
[![Docker](https://img.shields.io/badge/docker-v1.1.0-blue.svg)](Dockerfile)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

**ScribeNode** is a full-stack, high-throughput AI audio transcription and speech intelligence web application. Powered by Google's Gemini Flash AI model suite, ScribeNode transforms raw podcast recordings, meeting audio, interviews, and voice notes into polished clean-verbatim transcripts, structured chapters, executive summaries, and actionable key takeaways.

> **Note on Development**: This project was built using AI-assisted pair programming ("vibecoded") and then manually audited, refined, and tested for code quality, type safety, and container security.

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

To run ScribeNode, configuration values can be provided via a `.env` file or directly passed as environment variables in Docker Compose / container settings.

### `.env` File Reference

Create a `.env` file in the same directory as `docker-compose.yml` or your application root:

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

# 📦 OPTIONAL: Disable Preseeded Example Items
# Defaults to false. Set to "true" to prevent example audio items from being added on startup.
DISABLE_DEFAULT_ITEMS="false"
```

---

## Homelab & Self-Hosting with Docker Compose

ScribeNode is optimized for home lab deployment via Docker Compose using either local compilation or pre-built container images from **GitHub Container Registry (GHCR)**.

### Configuration Methods: `.env` File vs `docker-compose.yml`

Docker Compose supports two primary ways to set environment variables for your ScribeNode container:

1. **Recommended Method — Central `.env` File**:
   - Place a `.env` file alongside `docker-compose.yml`.
   - The `docker-compose.yml` file uses variable placeholders (e.g., `GEMINI_API_KEY=${GEMINI_API_KEY}`).
   - **Why this is best**: Keeps sensitive secrets (like API keys and passwords) out of `docker-compose.yml`, making your compose file safe to commit to Git or share.

2. **Alternative Method — Direct Inline Values in `docker-compose.yml`**:
   - Hardcode literal values directly into `docker-compose.yml` (e.g., `- GEMINI_API_KEY=AIzaSyYourKeyHere`).
   - **Note**: If you hardcode values directly in `docker-compose.yml`, you do not need a `.env` file, but be careful not to expose API keys publicly.

#### Environment Variable Precedence in Docker Compose

If an environment variable is defined in multiple places, Docker Compose resolves values in the following precedence order (highest priority wins):

1. **Explicit values hardcoded in `docker-compose.yml`**: E.g., `- GEMINI_API_KEY=my_hardcoded_key` overrides everything.
2. **Host shell environment variables**: E.g., running `export GEMINI_API_KEY="key"` in terminal before `docker compose up`.
3. **Values in the `.env` file**: Key-value pairs defined in the `.env` file sitting next to `docker-compose.yml`.
4. **Default fallbacks inside `${VAR:-default}` syntax**: E.g., `${PORT:-3000}` uses `3000` if `PORT` is omitted from both shell and `.env`.

---

### Step-by-Step Docker Compose Deployment

#### 1. Save `docker-compose.yml`

Save the following `docker-compose.yml` file to your deployment directory:

```yaml
services:
  scribenode:
    # -------------------------------------------------------------------------
    # Option 1: Pull official pre-built public image (Recommended, zero build step)
    image: ghcr.io/willpresley/scribenode-podcast-transcription:latest

    # Option 2: Or build locally from source code
    # build:
    #   context: .
    #   dockerfile: Dockerfile

    # Option 3: Or pull from your own private/forked GHCR image
    # image: ghcr.io/YOUR_FORK_USERNAME/scribenode-podcast-transcription:latest
    # -------------------------------------------------------------------------

    container_name: scribenode-app
    restart: unless-stopped
    ports:
      - "${PORT:-3000}:${PORT:-3000}"

    # Variable references pass values automatically from your .env file
    environment:
      - NODE_ENV=production
      - PORT=${PORT:-3000}
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - APP_URL=${APP_URL:-http://localhost:3000}
      - APP_TITLE=${APP_TITLE:-ScribeNode – Transcription Engine}
      - BASIC_AUTH_ENABLED=${BASIC_AUTH_ENABLED:-false}
      - BASIC_AUTH_USER=${BASIC_AUTH_USER:-}
      - BASIC_AUTH_PASS=${BASIC_AUTH_PASS:-}
      - DISABLE_DEFAULT_ITEMS=${DISABLE_DEFAULT_ITEMS:-false}

    volumes:
      - scribenode_uploads:/app/uploads

volumes:
  scribenode_uploads:
```

#### 2. Create your `.env` file

Create a `.env` file in the same directory:

```env
GEMINI_API_KEY=AIzaSyYourActualGeminiApiKeyHere
PORT=3000
APP_TITLE=ScribeNode – Homelab Engine
BASIC_AUTH_ENABLED=false
DISABLE_DEFAULT_ITEMS=true
```

#### 3. Launch ScribeNode

```bash
docker compose up -d
```

Your ScribeNode container will automatically read the `.env` file, bind to the configured port, and persist audio jobs to the `scribenode_uploads` volume!

---

## Container Registry (GHCR) & Image Distribution

ScribeNode utilizes **GitHub Container Registry (GHCR)** for continuous automated container builds via GitHub Actions (`.github/workflows/deploy.yml`).

### 🌐 Pulling Public Images (No Authentication Required)

Once the package is set to Public, anyone can pull and run the pre-built Docker image directly on any server or homelab node without needing a GitHub account or personal access token:

```bash
# Direct Docker run
docker run -d \
  -p 3000:3000 \
  --name scribenode-app \
  --env-file .env \
  -v scribenode_uploads:/app/uploads \
  ghcr.io/willpresley/scribenode-podcast-transcription:latest
```

---

### 🛠️ Setting GHCR Package Visibility to Public (For Repository Owners)

When you first push code to `main`/`master`, GitHub Actions will build and publish your image to GHCR as **Private** by default. To allow anyone to pull the image publicly:

1. Navigate to your GitHub Profile or Organization page.
2. Click the **Packages** tab.
3. Click on the **`scribenode-podcast-transcription`** package.
4. In the right sidebar, click **Package settings**.
5. Scroll down to the **Danger Zone** section and click **Change package visibility**.
6. Select **Public**, type `scribenode-podcast-transcription` to confirm, and click **I understand the consequences, make this package public**.
7. *(Optional)* Under **Repository source**, link the package to your `scribenode-podcast-transcription` repository to enable automatic public synchronization.

---

### 🔒 Forking or Maintaining Private GHCR Packages

If you maintain a private fork of ScribeNode and want to keep your GHCR package private:

#### 1. Configure GitHub Actions Workflow Permissions
Ensure GitHub Actions has permission to publish images:
1. In your repository, go to **Settings** $\rightarrow$ **Actions** $\rightarrow$ **General**.
2. Under **Workflow permissions**, select **Read and write permissions**.
3. Click **Save**.

#### 2. Authenticate Your Homelab Host with a Personal Access Token (PAT)
To pull a private package on your home server or VM:
1. Generate a Classic Personal Access Token on GitHub (**Settings** $\rightarrow$ **Developer Settings** $\rightarrow$ **Personal access tokens** $\rightarrow$ **Tokens (classic)**).
2. Select the **`read:packages`** scope (and **`write:packages`** if publishing from external CI).
3. Log in to GHCR on your server:

```bash
echo "YOUR_GITHUB_PAT" | docker login ghcr.io -u "YOUR_GITHUB_USERNAME" --password-stdin
```

4. Now you can pull your private image seamlessly:

```bash
docker compose pull && docker compose up -d
```

---

## Local Development Setup

### Prerequisites
- Node.js 22 or higher
- npm v10 or higher
- Google Gemini API Key

### Installation

```bash
# Clone the repository
git clone https://github.com/WillPresley/scribenode-podcast-transcription.git
cd scribenode-podcast-transcription

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

## Testing & Quality Assurance Suite

ScribeNode includes a comprehensive, automated test suite built with Vitest and Supertest covering backend APIs, audio processing math, transcript parsing/formatting, security routines, storage persistence, and packaging/release integrity.

### Running Tests

```bash
# Run the complete test suite
npm test

# Run tests with detailed code coverage report
npm run test:coverage
```

### Test Scope & Coverage
- **Unit Tests (`tests/unit/`)**:
  - **Transcript Engine**: Speaker inference, title normalization, header stripping, speaker bolding, Markdown clean-verbatim rules, SRT subtitle formatting, WebVTT generation, and chapter breakdown.
  - **Audio Math & Optimization**: Duration formatting, timestamp conversion, sample rate & PCM bit depth calculations.
  - **Security & Config Guard**: Environment variable parsing, quote stripping, boolean flags normalization, HTTP Basic Auth credential validator.
  - **AI Model Cascade**: Prompt builders, system instruction formatting, and exponential backoff retry/fallback mechanics.
  - **Storage & Disk Persistence**: JSON database persistence, preseeded sample items lifecycle, garbage collection for orphaned uploads and temporary files.
- **Integration Tests (`tests/integration/`)**:
  - **API Endpoints**: Health probes (`/api/health`, `/healthz`), configuration (`/api/config`), Jobs CRUD, archive toggle (`/api/jobs/:id/archive`), sample job retranscription, analysis generation (`/api/jobs/:id/analyze`), and Basic Auth enforcement.
  - **Release & Packaging**: Validation of `package.json`, `package-lock.json` sync, `Dockerfile`, `docker-compose.yml`, GitHub Actions workflow, and metadata files.

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
- Validates type safety (`tsc --noEmit`) and lints code with zero warnings.
- Builds the client bundle and bundles the server entry point via `esbuild`.
- Compiles and publishes a multi-platform Docker container image to **GitHub Container Registry (GHCR)** on every push to `main` or `master`.
- Embeds OpenContainer (OCI) metadata annotations linking the image directly back to the public repository.

---

## License

Distributed under the MIT License. See `LICENSE` for more information.
