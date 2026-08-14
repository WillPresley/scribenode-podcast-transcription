# Project Rules & Custom Instructions for ScribeNode

## 1. Package Management & Lockfile Integrity (CRITICAL)
- **Always Keep `package-lock.json` in Sync**: Whenever `package.json` is modified (adding/updating dependencies, changing versions, or adding `overrides`/`resolutions`), immediately run `npm install --package-lock-only` (or `npm install`) and verify with `npm ci` before concluding the task.
- **Never Leave Lockfile Stale**: CI/CD pipelines use `npm ci`, which will fail if `package-lock.json` does not strictly match `package.json`.
- **Transitive Security Fixes**: Prefer `npm` `overrides` in `package.json` for nested/transitive package vulnerabilities, and immediately refresh `package-lock.json`.

## 2. Environment Variables & Type Safety
- **Boolean Environment Variables**: Environment variables parsed from `.env` or process environment are ALWAYS strings. 
  - Never check strict equality like `process.env.VAR === true`.
  - Always normalize booleans explicitly using string comparison: `const isEnabled = process.env.MY_VAR?.trim().toLowerCase() === "true"`.
  - Strip surrounding quotes if present (e.g., handling both `"true"` and `true`).
- **Default Fallbacks**: Always provide explicit default fallback values when reading optional environment variables.
- **Environment Documentation**: Any new environment variable MUST be documented in `.env.example` and the README configuration section.

## 3. Docker & Deployment Compatibility
- **Single Source of Truth in Docker Compose**: Ensure `docker-compose.yml` uses environment variable pass-through syntax (`- PORT=${PORT:-3000}`) rather than hardcoding static values, allowing `.env` overrides to work seamlessly.
- **Preserve Persistent Volume Directories**: Ensure server storage routines check for existing persisted jobs/uploads in volume mounts (`/app/uploads/jobs.json`) before seeding default/sample data.
- **Stateless Port Binding**: Server entry points must bind to `0.0.0.0` and respect `process.env.PORT` (default `3000`/`4200` per compose setup).

## 4. Dependabot & Supply Chain Maintenance
- **Dependabot Grouping**: Keep Dependabot updates grouped (minor/patch combined, major isolated) with monthly cadences (`interval: "monthly"`) to minimize PR noise while keeping security fixes responsive.
- **Ignores & Constraints**: Maintain strict major version ignores on core infrastructure tools (e.g., `typescript`) until explicitly requested for upgrade.

## 5. GitHub Actions & Runner Compatibility
- **Prefer Native Docker CLI in Workflows**: In GitHub Actions workflows running on `ubuntu-latest`, do NOT introduce third-party marketplace actions for basic Docker setup (e.g., avoid `docker/setup-buildx-action` which carries deprecated Node.js runtime warnings). Always use native runner CLI commands (e.g., `run: docker buildx create --use`).
- **Core Action Pinning**: Ensure standard GitHub actions (`actions/checkout`, `actions/setup-node`) use modern, supported versions that run on active Node runtimes.

## 6. Test Suite & Coverage Maintenance (Vitest & Supertest)
- **Continuous Test Coverage**: Any new helper utility, API endpoint, formatting rule, or backend storage logic MUST be accompanied by corresponding unit or integration tests in `tests/unit/` or `tests/integration/`.
- **Prevent Regressions**: Ensure existing test suites (`tests/unit/transcript.test.ts`, `tests/unit/audio.test.ts`, `tests/unit/config.test.ts`, `tests/unit/transcriptionEngine.test.ts`, `tests/unit/storage.test.ts`, `tests/integration/api.test.ts`, `tests/integration/packaging.test.ts`) are updated whenever functional contracts or schemas change.
- **Zero-Failure Mandate**: All test suites must execute cleanly (`npm test` / `npm run test:coverage`) with 100% passing tests before completing any task.

## 7. Verification & Quality Assurance Checklist Before Finishing
Before declaring any coding task complete, execute the following verification loop:
1. `npm run lint` (TypeScript type check / syntax checks)
2. `npm test` (verify all unit and integration test assertions pass)
3. `npm install --package-lock-only` (if `package.json` was touched)
4. `npm ci` (verify clean install compatibility)
5. `compile_applet` / `npm run build` (verify production build bundling)

## 8. Release Management & Version Snapshotting
- **Comprehensive Change Review**: Whenever a new numbered or named release is requested (e.g., `v1.2.0`), perform a thorough check of all changes, improvements, refactors, and bug fixes introduced since the previous release.
- **Major Highlights & Release Notes**: Clearly articulate and summarize the most critical and major updates in the release summary.
- **UI Footer & Release Notes Sync**: Update the frontend UI Footer version badge and the 'About & Release Notes' modal (version tag, core model, and "What's New in vX.X.X" change bullets) to match the newly released version.
- **Server Startup Banner & Dynamic Versioning**: Ensure the backend server startup banner dynamically reads the current release version from `package.json` (`getAppVersion()`) or is updated to reflect the new release version.
- **Package & Documentation Alignment**: Update `package.json`, `README.md` (version badges, architecture table, pipeline overview), and sync `package-lock.json`.
- **GitHub Tag Snapshotting**: If git and repository access are available, ensure a matching Git tag (e.g., `v1.2.0`) is created and pushed to the repository to snapshot that specific milestone of the project.

