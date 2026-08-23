# Dockerfile for the web-frontend (React + Vite dev server, Bun inside container).
# Uses Vite's dev server for hot reload in development.
#
# Pattern: deps stage caches `bun install`. Source code is bind-mounted in dev
# via docker-compose.override.yml, so the image only needs node_modules.

# syntax=docker/dockerfile:1.4
FROM oven/bun:1.3.14 AS base
WORKDIR /app

# ─── deps stage — cached unless package.json/bun.lock change ───────────────
FROM base AS deps

COPY package.json bun.lock bunfig.toml ./
COPY packages/config/package.json        ./packages/config/
COPY packages/contracts/package.json     ./packages/contracts/
COPY packages/cost-tracker/package.json  ./packages/cost-tracker/
COPY packages/database/package.json      ./packages/database/
COPY packages/gemini-client/package.json ./packages/gemini-client/
COPY packages/deepseek-client/package.json ./packages/deepseek-client/
COPY packages/llm-provider/package.json  ./packages/llm-provider/
COPY packages/server/package.json        ./packages/server/
COPY packages/workflow-engine/package.json ./packages/workflow-engine/
COPY services/api-gateway/package.json          ./services/api-gateway/
COPY services/embedding-service/package.json    ./services/embedding-service/
COPY services/image-service/package.json        ./services/image-service/
COPY services/research-service/package.json     ./services/research-service/
COPY services/story-service/package.json        ./services/story-service/
COPY services/voice-service/package.json        ./services/voice-service/
COPY services/video-service/package.json        ./services/video-service/
COPY services/workflow-service/package.json     ./services/workflow-service/
COPY web-frontend/package.json          ./web-frontend/

RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

# ─── development stage — bind-mounted source via docker-compose ────────────
FROM base AS development

# Only node_modules from deps — source comes from bind mounts in dev.
COPY --from=deps /app/node_modules ./node_modules
COPY package.json bunfig.toml tsconfig.json ./

WORKDIR /app/web-frontend

EXPOSE 5173

CMD ["bunx", "--bun", "vite", "--host", "0.0.0.0", "--port", "5173"]
