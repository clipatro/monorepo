# AGENTS.md — Clipatro

> **Read this first, every session.**

## Project

A **Bun + TypeScript microservices** application (Docker Compose) that turns a topic into an approved storyline, scene plan, consistent character images, synchronized voice-over, and a CapCut-ready asset package. It does NOT assemble or render videos.

- **Code root:** `/home/alinaqi/work/projects/automation`
- **Runtime:** Bun 1.3.14 + TypeScript — **runs inside every Docker container** (services + web frontend)
- **Orchestration:** Docker Compose (one container per capability service)
- **Database:** local SQLite (`bun:sqlite`) — single instance, `channel_id` isolation
- **Frontend:** React + Vite + `@xyflow/react` (Bun dev server in Docker)
- **HTTP:** Hono (all services + API gateway)
- **Story/research provider:** Gemini API (`gemini-3.6-flash` for story, `gemini-3.7-flash` + `google_search` for research)
- **Image provider:** Gemini 3.1 Flash Image (standard, `gemini-3.1-flash-image`) for character scenes, Flash Lite Image (`gemini-3.1-flash-lite-image`) for non-character scenes — frozen after Phase 0 (S08/S09 confirmed)
- **TTS provider:** Kokoro `af_heart` (primary, local/free), Gemini TTS `Algenib` (fallback)
- **Embeddings:** `Xenova/all-MiniLM-L6-v2` via Transformers.js (local, 384 dims)
- **Phase 0 status:** Complete (S01–S09 all pass). Provider defaults frozen in Obsidian Decisions Log D006–D009.
- **Phase 5 status:** Complete. voice-service fully implemented (Kokoro + Gemini TTS, FFmpeg normalization, scene timing, SRT, gameplay video cutting, export package ZIP). 55 tests pass.
- **Phase 6 status:** Complete. Hardening and multi-channel readiness — Docker integration, provider fallbacks, budgets dashboard, backup/restore, corrupt artifact handling, restart/retry recovery, multi-channel isolation, accessibility/responsive layout, PostgreSQL migration docs, E2E fixtures, security audit. 68 tests pass across three test suites.
- **Phase 1 status:** Complete. All 7 services + web-frontend scaffolded, Docker Compose stack ready, 27-table SQLite schema migrated, channel + character CRUD working with shadcn/ui frontend. Typecheck passes.
- **Phase 2 status:** Complete. Durable workflow engine with transactional step claiming, 5-min leases + crash recovery, exponential backoff retries, 4 human approval checkpoints, budget checks, SSE live updates, React Flow pipeline graph. 23 tests pass.
- **Phase 3 status:** Complete. Story pipeline with Gemini classification, research with grounding, candidate generation, 5-layer duplicate detection (exact hash, FTS lexical, semantic embeddings, story-DNA, Gemini adjudication), story versioning, frontend story comparison UI. 24 tests pass.
- **Phase 4 status:** Complete. Image pipeline with scene planning (Gemini 3.6 Flash), 10-part prompt compiler, GeminiFlashImageAdapter (standard, multi-reference) for character scenes, GeminiFlashLiteImageAdapter (Lite) for non-character scenes, per-scene generation/acceptance/rejection, manual Flow mode, cost tracking, workflow handlers, API gateway routes, frontend ImagesPage. 49 tests pass.
- **Cost tracking:** `@automation/cost-tracker` package — every paid call is logged in SQLite, budget-guarded. CLI: `bun run cost`.
- **Characters:** DYNAMIC, not hardcoded. Seed data includes 3 characters (Emily, George, Noah) with full bibles and 4 optimized reference images each in `characters/{Name}/optimized-512/`. Run `bun run seed` to create the default channel and characters. Any number of characters can be created per channel and swapped at any time. Realistic prompt approach frozen (D008).
- **Gameplay videos:** `media/gameplay/` contains copyright-free gameplay videos (cycling.mp4, minecraft.mp4). Phase 5 cuts a muted segment of random length from a random middle point to match the voiceover duration.
- **Channels:** MULTI-CHANNEL from day one. Each channel is a database record with its own niche, character(s), provider settings, style profile, and pipeline runs. No hardcoded channels.

## Architecture (see [[Decisions Log]] D001–D010)

Each generation capability is its own microservice behind a unified facade/repository contract so providers can be swapped by implementing one adapter — no caller changes.

- `story-service` — `StoryGenerator` facade → `GeminiStoryAdapter`
- `research-service` — `Researcher` facade → `GeminiGroundingAdapter`
- `image-service` — `ImageGenerator` facade → `GeminiFlashImageAdapter` (standard, character scenes), `GeminiFlashLiteImageAdapter` (Lite, non-character scenes) (future: Flux, Flow)
- `voice-service` — `VoiceSynthesizer` facade → `KokoroAdapter`, `GeminiTtsAdapter`
- `embedding-service` — `Embedder` facade → `LocalOnnxEmbedder`
- `workflow-service` — durable runner, step claiming, approvals, SSE
- `api-gateway` — Hono facade aggregating services
- `web-frontend` — React + Vite + React Flow pipeline graph
- `db` — SQLite (mounted volume)
- `artifact-store` — local file storage (mounted volume)

All facades share a common `ProviderRequest`/`ProviderResponse` envelope (provider, model, request id, cost, usage, checksum, lineage). Shared interfaces live in a `contracts` package.

## Shared packages

- `@automation/contracts` — facade interfaces + provider envelope types
- `@automation/cost-tracker` — pricing catalog, cost calculator, SQLite ledger, budget guard, reporter, CLI
- `@automation/database` — SQLite connection (WAL), typed migration runner, schema types. CLI: `bun run migrate`
- `@automation/config` — centralized env config, typed AppConfig, service URLs, secret redaction
- `@automation/server` — shared Hono server utilities (CORS, logging, health, graceful shutdown, `Bun.serve`)
- `@automation/workflow-engine` — durable SQLite-backed workflow runner (step claiming, leases, retries, approvals, SSE, budget checks)
- `@automation/gemini-client` — shared Gemini API client (structured JSON, grounding, cost tracking, JSON extraction)

## Cost tracking

Every paid provider call must:
1. Call `checkBudget()` before the call (throws `BudgetExceededError` if exceeded)
2. Call `recordCost()` after the call with the cost breakdown + usage metadata
3. Budget defaults: $2/run, $10/day, $100 global (env-configurable)
4. CLI: `bun run cost [summary|recent|run <id>|budget]`
5. Ledger DB: `data/cost-ledger.sqlite` (gitignored)

## Source of truth — Obsidian

All planning, progress tracking, decisions, and session history live in Obsidian, NOT in this repo. Before doing anything, read:

1. **`/home/alinaqi/Documents/Obsidian Vault/Clipatro/README.md`** — project hub.
2. **`Implementation Plan.md`** — the approved full design and phase plan (1132 lines). This is the spec.
3. **`Progress Tracker.md`** — live task status. Check the active phase.
4. **`Session Log.md`** — what previous sessions did. Append your session at the end.
5. **`Decisions Log.md`** — runtime decisions and deviations from the plan.
6. **`Open Questions.md`** — unresolved blockers. Check before starting work.
7. **`Spike Results.md`** — Phase 0 spike outcomes.
8. **`Provider Credentials.md`** — where API keys live (paths only, never secrets).

## Session protocol

1. **Start of session:** read the Obsidian hub, `Progress Tracker`, and the latest `Session Log` entry.
2. **Pick work:** take the next incomplete item from the active phase in `Progress Tracker`.
3. **Deviations:** before deviating from `Implementation Plan.md`, record the reason in `Decisions Log.md`.
4. **New questions:** add to `Open Questions.md`; when resolved, move to `Decisions Log.md`.
5. **End of session:** append a dated entry to `Session Log.md` and update `Progress Tracker.md`.

## Hard rules

- **Never commit secrets.** API keys live in `<project_root>/.env` (gitignored). Document key *paths* in `Provider Credentials.md`, never values.
- **No paid provider calls** until a benchmark budget is explicitly approved by the user (per the plan's approval state).
- **Do not modify** the Obsidian `Implementation Plan.md` without recording a decision in `Decisions Log.md`.
- **Follow the plan's stack choices.** If a library is needed, confirm it is Bun-compatible and prefer versions published at least 7 days ago.
- **Verify before marking done.** Run typecheck/build/tests as applicable before checking a box in `Progress Tracker.md`.

## Phases (summary — full task lists in Obsidian `Implementation Plan.md`)

- Phase 0 — Technical and quality spikes — **COMPLETE**
- Phase 1 — Application foundation (microservices + Docker Compose, Bun in every container) — **COMPLETE**
- Phase 2 — Durable workflow system (workflow-service) — **COMPLETE**
- Phase 3 — Story and originality pipeline (story-service + research-service + embedding-service) — **COMPLETE**
- Phase 4 — Character, scenes, and images (image-service) — **COMPLETE**
- Phase 5 — Voice, timing, and export (voice-service) — **COMPLETE**
- Phase 6 — Hardening and multi-channel readiness (all services) — **COMPLETE**
- Phase 7 — Context-Aware Character System (decouple characters from channels, multi-character stories, auto-character creation) — **COMPLETE**
- Phase 8 — Video Templates System (template-driven video assembly, FalVideoAdapter, template-aware scene planner) — **COMPLETE**

## Verification commands

```bash
# Typecheck
bun run typecheck

# Database migration + seed
bun run migrate                   # apply migrations (host)
bun run seed                      # seed all channels + characters (idempotent)
bun run seed -- --reset           # drop and re-seed all channels

# Via API (when Docker stack is running):
curl -X POST http://localhost:3000/api/seed
curl -X POST http://localhost:3000/api/seed -d '{"reset":true}' -H 'Content-Type: application/json'

# Phase-specific test suites (require Docker stack running)
bun run scripts/test-phase5.ts      # 55 tests — voice, timing, export
bun run scripts/test-phase6.ts      # 28 tests — hardening, multi-channel, security
bun run scripts/test-restart-retry.ts  # 11 tests — restart/retry recovery
bun run scripts/test-e2e-fixtures.ts   # 29 tests — end-to-end fixtures

# Cost tracking CLI
bun run cost [summary|recent|run <id>|budget]

# Docker
docker compose up -d              # start all services (except video-service)
docker compose down -v            # stop and wipe runtime data (clipatro-data named volume)
docker compose build              # rebuild images
# Inspect runtime data inside the named volume:
docker compose exec api-gateway bun run cost summary
docker compose exec api-gateway ls -la /app/data

# Video service (runs on HOST for GPU access — not in Docker)
# Must be started separately after docker compose up:
PORT=3007 API_GATEWAY_URL=http://localhost:3000 bun run services/video-service/src/index.ts
# With GPU rendering:
HYPERFRAMES_GPU=1 PORT=3007 API_GATEWAY_URL=http://localhost:3000 bun run services/video-service/src/index.ts
```

## No hardcoded channels or characters

- **Channels are database records.** The system supports multiple YouTube channels from day one, each with its own niche, character(s), provider settings, style profile, and pipeline runs.
- **Characters are database records.** Any number of characters can be created per channel and swapped at any time.
- **Seed data:** `bun run seed` creates the default "Emily's Mediterranean Life" channel with 3 characters (Emily, George, Noah), each with frozen versions and 4 reference images. The script is idempotent and supports `--reset`.
- No service, adapter, or UI component may assume a specific channel or character. All configuration flows from the channel record and its associated character version.

## Quick pointers

- Obsidian folder: `/home/alinaqi/Documents/Obsidian Vault/Clipatro/`
- Implementation plan: `Implementation Plan.md` in that folder
- Current active phase: Phase 5 — Voice, timing, and export (voice-service) — see `Progress Tracker.md`
