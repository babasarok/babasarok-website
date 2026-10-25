# Built on the ARM64 box (CAX21); the Cloudflare build has no Docker daemon,
# so the deploy ships the source and the box builds this image.
FROM node:24-slim

WORKDIR /app

# Workspace manifests first so dependency install is a cached layer.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY backend/package.json ./backend/

RUN npm install -g pnpm@12.15.0 \
  && pnpm install --filter babasarok-vendure-backend --ignore-scripts --frozen-lockfile

COPY backend/ ./backend/
# Compiles dist/ (tsc) and the dashboard (vite). The dashboard build's env
# placeholders live in the committed backend/build.env; a local backend/.env,
# if present, overrides them.
RUN pnpm -C backend run build

WORKDIR /app/backend
CMD ["node", "dist/index.js"]
