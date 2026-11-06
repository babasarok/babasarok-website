# Built on the ARM64 box (CAX21); the Cloudflare build has no Docker daemon,
# so the deploy ships the source and the box builds this image.
FROM node:24-slim

WORKDIR /workspace

# Workspace manifests first so dependency install is a cached layer.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY patches ./patches
COPY backend/package.json ./backend/

# `pnpm deploy` installs only the backend's dependencies into an isolated
# directory; a filtered `pnpm install` would also install the workspace
# root's (site) dependencies.
RUN npm install -g pnpm@12.15.0 \
  && pnpm --filter babasarok-vendure-backend deploy --ignore-scripts /app/backend \
  && rm -rf /workspace

WORKDIR /app/backend
COPY backend/ ./
# The shared schemas and pricing rules live inside the backend tree
# (backend/src/shared) and compile as part of the backend's own tsc build —
# no package artifacts or workspace symlinks. tsc is invoked directly:
# `pnpm run` re-resolves the manifest, whose workspace state cannot resolve
# outside a workspace.
RUN ./node_modules/.bin/tsc -b

CMD ["node", "dist/index.js"]
