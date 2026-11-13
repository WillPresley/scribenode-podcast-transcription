# Changelog

All notable changes to **ScribeNode** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.7.0] - 2026-11-13 — Gemini 4 Hydrogen Flagship & Homelab CI Hardening

### Added
- **Gemini 4 Hydrogen (`gemini-4-hydrogen`) as `#1` Flagship Model**: Promoted Gemini 4 Hydrogen to the primary default model for audio transcription, multimodal comprehension, and downstream analysis, positioning `gemini-3.8-flash` at `#2` inside a 9-tier automatic failover cascade (`gemini-4-hydrogen` → `gemini-3.8-flash` → `gemini-3.6-flash` → `gemini-flash-latest` → `gemini-flash-lite-latest` → `gemini-3.1-flash-lite` → `gemini-3.7-flash` → `gemini-3.5-flash` → `gemini-3.5-flash-lite`).
- **Unified Project Changelog & In-App History**: Added `CHANGELOG.md` spanning `v1.0.0` through `v1.7.0` and integrated it directly into the About & Release Notes modal with an expandable full-history viewer.

### Changed
- **Gemini 4 Thinking-Level Safeguards**: Extended `sanitizeGenerationConfig` so `gemini-4-hydrogen` automatically promotes `minimal`/`MINIMAL` thinking levels to `low`/`LOW` (preventing HTTP 400 rejections) while preserving `xhigh`/`XHIGH` and omitting deprecated sampling parameters (`temperature`, `topP`, `topK`) and `thinkingBudget`.
- **Cross-Project Model & Telemetry Alignment**: Synchronized UI diagnostics, frontier fallback notices, architecture pipeline diagrams, metadata descriptions, and server User-Agent headers (`server/rss.ts`, `server/remote.ts`) to dynamically use `getAppVersion()`.
- **GitHub & Gitea Actions CI Modernization**: Switched `.github/workflows/deploy.yml` to native `git` checkout, native NVM Node.js 26 setup, and native `docker buildx create --use` CLI; streamlined `.gitea/workflows/ci.yml` for reliable `act_runner` execution across `main`/`master` without stalling external npm cache calls.

### Fixed
- **Homelab & Proxmox LXC CPU Compatibility (`SIGILL` Prevention)**: Pinned `rolldown` (`1.2.14`), Vite (`8.3.5`), and Vitest (`5.0.5`) with corresponding Dependabot constraints and a synced `package-lock.json` to prevent illegal instruction (`SIGILL` / exit code 132) crashes on `x86-64-v2` Intel Xeon E5-2660 v2 systems and Alpine/Proxmox LXC runners.

---

## [1.6.0] - 2026-11-01 — Tri-Theme UI, Atomic Storage & Docker Hardening

### Added
- **Full Tri-Theme Architecture (Light, Dark & System OS Adaptive)**: Added a dedicated `ThemeToggle` component supporting crisp Light mode, deep slate Dark mode, and automatic OS `prefers-color-scheme` synchronization with live `<meta name="theme-color">` updates.
- **Modularized Component Decomposition**: Extracted dialogs and controls into clean standalone components (`AboutReleaseNotesModal`, `ModelDiagnosticsPopover`, `SpeakerRenameModal`, `BackupRestoreModal`, `ThemeToggle`, `GlossaryInput`, `AudioPlayer`).

### Changed
- **Production Container Hardening**: Updated `server.ts` to dynamically import Vite dev middleware only in non-production environments, decoupling slim production containers (`npm ci --only=production`) from devDependencies.
- **Supply Chain & SDK Modernization**: Upgraded to `@google/genai` v3.0.0 (`v1beta` default routing), Tailwind CSS v4, unified Node.js 24/26 CI parity, and expanded Vitest coverage.

### Fixed
- **Atomic Disk Persistence & Path Traversal Immunity**: Replaced direct overwrites in `server/storage.ts` with atomic `.tmp` serialization and `fs.renameSync`, consolidated write I/O debouncing, and enforced `isPathWithinUploads()` boundary validation across audio streaming and deletion routes.

---

## [1.5.5] - 2026-10-15 — Progressive Web App (PWA) & Offline Resilience

### Added
- **Progressive Web App (PWA) Support**: Integrated `vite-plugin-pwa` with standalone window framing, branded PNG/SVG icon sets, Workbox precaching, `/api/*` & `/health*` network-only exclusions, and `PwaBanner` offline detection for reviewing and exporting cached transcripts offline.

### Changed
- **Model Registry & Gemini 2.5 Deprecation Routing**: Added automatic normalization mapping legacy `gemini-2.5-flash` / `gemini-2.5-flash-lite` references to `gemini-3.5-flash-lite` and verified active cascade aliases.

---

## [1.5.1] - 2026-10-05 — RSS Pagination, Duration Fallbacks & Banner Polish

### Added
- **RSS Feed Pagination & Archive Search**: Enhanced `RssFeedPicker` with 50/100 episode pagination and full-archive search filtering.
- **Audio Duration Fallback Probing**: Added `server/audioDuration.ts` and enclosure byte-size estimation (`~MM:SS (est.)`) when `itunes:duration` metadata is absent.
- **70-Column Startup Banner**: Standardized `server/banner.ts` terminal output with smart path ellipsis truncation and dynamic `package.json` versioning.

### Changed
- **Automated Supply Chain Monitoring**: Configured `.github/dependabot.yml` with grouped weekly updates and immediate security advisories.

---

## [1.5.0] - 2026-09-20 — Gemini 3.8 Flash, RSS Ingestion & Vocabulary Glossary

### Added
- **Podcast RSS Feed & Remote URL Ingestion**: Added live RSS feed parsing (`server/rss.ts`) and remote audio downloading (`server/remote.ts`).
- **Enterprise SSRF & ReDoS Security Guards**: Implemented `server/ssrf.ts` with pre-flight DNS inspection (blocking RFC 1918, RFC 3927, loopback, and cloud metadata `169.254.169.254`), manual per-hop redirect validation, and linear $O(n)$ DNS/input parsers.
- **Custom Vocabulary & Transcript Editing**: Added domain glossary prompt injection (`GlossaryInput`), in-place Markdown editing (`TranscriptEditor`), and one-click global speaker renaming (`SpeakerRenameModal`).

### Changed
- **Gemini 3.8 Flash Promotion**: Elevated `gemini-3.8-flash` to primary model status within a multi-tier automatic failover sequence.

---

## [1.4.0] - 2026-09-01 — Homelab Backup & Adaptive Mobile Workspace

### Added
- **Homelab Full Backup & Disaster Recovery**: Added `server/backup.ts` and `BackupRestoreModal` for one-click `.zip` workspace snapshots (transcripts, notes, chapters, and raw audio) with Merge and Clean Replace restore strategies.
- **Adaptive Mobile Workspace**: Added responsive mobile navigation drawer, segmented workspace tabs, and touch-friendly audio controls.

---

## [1.3.0] - 2026-08-15 — Live Model Orchestration & Downstream Intelligence

### Added
- **Model Orchestration & Friendly Diagnostics**: Added `ModelDiagnosticsPopover` for real-time per-model health tracking, human-readable 503/429/400/403/504 error categorization, manual model prioritization, and instant cascade reset.
- **Downstream AI Content Pipelines**: Added automated generation of executive summaries, timestamped chapters, key takeaways, social sharing drafts, and opt-in frontier `deep_synthesis`.

---

## [1.2.0] - 2026-08-01 — Multi-Format Exports, Audio Sync & Test Suite

### Added
- **Multi-Format Exports & Live Search**: Added Markdown (`.md`), Plain Text (`.txt`), SRT subtitle, and WebVTT (`.vtt`) exports alongside full-text transcript search and interactive audio timestamp scrubbing.
- **Automated Testing Foundation**: Introduced Vitest and Supertest unit and integration test suites covering transcript formatting, audio math, configuration parsing, and API routes.

---

## [1.1.0] - 2026-07-15 — Docker Self-Hosting, Persistence & Security

### Added
- **Docker & GHCR Packaging**: Added multi-stage Alpine `Dockerfile`, `docker-compose.yml` with persistent `scribenode_uploads` volume, and automated GitHub Container Registry builds.
- **Persistent Storage & Access Controls**: Implemented disk-backed job persistence (`server/storage.ts`), configurable upload limits (`MAX_UPLOAD_SIZE_MB`), `DISABLE_DEFAULT_ITEMS`, and opt-in HTTP Basic Authentication (`BASIC_AUTH_ENABLED`).

---

## [1.0.0] - 2026-07-01 — Initial Release

### Added
- **Core AI Speech & Transcript Engine**: Initial full-stack Express + React release featuring multipart audio uploads (MP3, WAV, M4A, OGG, FLAC), Gemini multimodal clean-verbatim transcription, speaker diarization, macro timestamps, and preseeded sample workspace items.
