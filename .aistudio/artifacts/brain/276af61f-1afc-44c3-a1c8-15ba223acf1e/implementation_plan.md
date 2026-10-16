# ScribeNode Comprehensive Optimization & Theme Implementation Plan

This plan outlines a full, thorough audit and enhancement pass for ScribeNode. It organizes optimizations, cleanups, refactors, and performance enhancements into itemized, self-contained units that can be reviewed and approved individually, culminating in the complete Light / Dark / System mode implementation.

---

## Itemized Recommendations & Optimizations

### 1. Dependency Hygiene & Supply Chain Cleanup
* **Move `@tailwindcss/vite` to `devDependencies`**: `@tailwindcss/vite` is purely a build-time Vite plugin and should reside in `devDependencies` rather than production runtime `dependencies`.
* **Prune Unused `autoprefixer`**: In Tailwind CSS v4 with `@tailwindcss/vite`, CSS compilation and vendor prefixing are handled natively by Lightning CSS. `autoprefixer` in `devDependencies` is redundant and can be cleanly removed.
* **Remove Stale `bun.lock`**: The project strictly uses `npm` (`npm ci`, `package-lock.json`, Dependabot). Maintaining a legacy `bun.lock` in the repository root causes clutter and confusion. Removing it enforces a single source of truth.
* **Lockfile Refresh & Verification**: Run `npm install --package-lock-only` and `npm ci` to verify zero dependency drift and 100% clean CI installation.

### 2. Build & Test Suite Speed-Ups
* **Worker Reuse in Vitest (`test.isolate: false`)**: 
  - Vitest currently spawns 13 isolated worker processes (~220ms startup per file), adding ~2.6+ seconds of unnecessary process spawn overhead to every test run.
  - Configuring `isolate: false` in `vitest.config.ts` reuses worker processes across test suites while maintaining 100% test isolation and speed.
* **Run Verification**: Ensure all 13 test files and 317+ assertions continue to pass with sub-second execution times.

### 3. Code Modularity & Component Decomposition
`src/App.tsx` has grown to over 4,160 lines of code, combining queue management, transcription viewing, analysis, diagnostics, settings, guides, and multiple modal overlays in a single file.
* **Extract `src/components/AboutReleaseNotesModal.tsx`**: Modularize the release notes, milestone highlights, and version specifications.
* **Extract `src/components/ApiSetupGuideModal.tsx`**: Modularize the Gemini API setup instructions and key configuration guide.
* **Extract `src/components/SystemDiagnosticsModal.tsx`**: Modularize the system health, active model failover topology, and diagnostic reset controls.
* **Extract `src/components/ThemeToggle.tsx`**: Create a dedicated, highly accessible 3-state toggle (`Light` | `Dark` | `System`) for the top header bar and mobile drawer.
* **Extract `src/components/TranscriptSegmentList.tsx`**: Encapsulate the timestamped speaker paragraph list, dynamic speaker coloration, search term highlighting, and audio playback follow-scroll.

### 4. Accessibility (a11y), Semantic HTML & Contrast Enhancements
* **Semantic Landmark Elements**: Ensure proper `<header>`, `<nav>`, `<main>`, `<aside>`, and `<footer>` landmarks for screen readers.
* **Keyboard Navigation & Focus Rings**: Add uniform, visible focus rings (`focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-hidden`) across all buttons, dropdowns, and interactive audio triggers.
* **Screen Reader Live Regions**: Add `aria-live="polite"` to model failover alerts and active transcription status bars so visually impaired users receive immediate speech feedback on background jobs.
* **Touch Targets**: Ensure minimum 44x44px touch targets on all mobile navigation items, timestamp playback buttons, and modal dismiss triggers.

### 5. Storage & Disk I/O Performance Cleanups
* **Debounced Job Serialization**: In `server/storage.ts`, debounce non-critical status updates to prevent multiple synchronous disk writes when handling concurrent audio chunks or rapid job edits.
* **Defensive Path Validation**: Ensure temporary directory creation is atomic to prevent transient `ENOENT` edge-cases during batch testing or container volume teardowns.

### 6. Light / Dark / System Mode Architecture (Final Core Feature)
* **Design Philosophy & Color Palette**:
  - **Light Theme Refinement**: Transform the current interface into a truly clean, light, and airy workspace. Crisp zinc-50 / slate-50 backgrounds, elevated pure white cards, refined `border-slate-200/90` edges, and deep slate text (`text-slate-900`, `text-slate-700`) for WCAG AAA contrast.
  - **Dark Theme (Deep Slate Neutral)**: Crafted with deep slate neutrals (`bg-slate-950` root, `bg-slate-900` cards, `bg-slate-800/80` elevated surfaces), crisp `border-slate-800` dividers, bright white titles (`text-white`), readable body text (`text-slate-300`), and vibrant status accents (emerald, blue, amber, violet).
* **System OS Auto-Sync**:
  - Support three modes: `'light'`, `'dark'`, and `'system'`.
  - On `'system'` (default), dynamically observe `window.matchMedia('(prefers-color-scheme: dark)')` to adapt immediately when the user's OS changes (e.g., sunrise/sunset transitions on Windows and Android).
  - Persist user choice in `localStorage.getItem('scribenode_theme')`.
  - Synchronize PWA `theme-color` meta tag in `<head>` dynamically with the active theme (`#0f172a` for dark, `#f8fafc` for light).
* **Dual Placement**:
  - **Top Header Bar**: Place a sleek 3-way toggle button / dropdown with Sun, Moon, and Monitor icons directly beside the Gemini Model health badge on desktop.
  - **Mobile Drawer Navigation**: Include a full-width, touch-friendly 3-state segmented toggle row in the mobile drawer so mobile users have effortless 1-tap switching.
* **Tailwind v4 Integration**:
  - Configure class-based dark variant in `src/index.css`: `@custom-variant dark (&:where(.dark, .dark *));`.
  - Toggle `.dark` class directly on `document.documentElement`.

### 7. Unit Testing & Quality Assurance
* **Theme Hook / Utility Test Suite (`tests/unit/theme.test.ts`)**:
  - Verify initialization with default `'system'` mode.
  - Verify `localStorage` persistence and retrieval.
  - Verify DOM `.dark` class toggling when switched between light, dark, and system.
  - Verify `prefers-color-scheme` change event listener reactions.
* **Full Verification Pipeline**:
  1. `npm run lint` (TypeScript compilation & type checking)
  2. `npm test` (all 14 test suites passing)
  3. `npm install --package-lock-only` && `npm ci`
  4. `compile_applet` & `npm run build`

---

## User Decision & Approval Flow
You can approve all items as a comprehensive milestone, or specify any adjustments to individual items (e.g., exclude certain refactors or prioritize specific cleanups). Once confirmed, we will proceed with implementation following our strict test-first verification lifecycle.
