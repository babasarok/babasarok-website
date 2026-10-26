# Built on the ARM64 box (CAX21); the Cloudflare build has no Docker daemon,
# so the deploy ships the source and the box builds this image.
FROM node:24-slim

WORKDIR /workspace

# Workspace manifests first so dependency install is a cached layer.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY backend/package.json ./backend/

# `pnpm deploy` installs only the backend's dependencies into an isolated
# directory; a filtered `pnpm install` would also install the workspace
# root's (site) dependencies.
RUN npm install -g pnpm@12.15.0 \
  && pnpm --filter babasarok-vendure-backend deploy --ignore-scripts /app/backend \
  && rm -rf /workspace

WORKDIR /app/backend
COPY backend/ ./
# Compiles the server (tsc). The dashboard SPA is built on the Cloudflare side
# (integrations/vendure-dashboard.ts) and served by the site's Worker at
# /dashboard, so it is not built or shipped in this image.
RUN pnpm run build

CMD ["node", "dist/index.js"]
