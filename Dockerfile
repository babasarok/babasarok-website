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
# TEMPORARY, preview-only (ADR 0009/0010): the preview seed reads the Tina
# catalog content baked into the image. The deploy tar ships the content
# dirs plus exactly the assets the content references (a local build of the
# full tree copies all of src/assets). `sr[c]` matches nothing when the
# context has no src/ (prod), so the COPY still succeeds. The content lands
# in the final image only when the build sets SEED_CONTENT=1 (the preview
# compose does; prod builds exclude it). Prod never runs the seed
# (hand-migration at cutover); drop this COPY and the SEED_CONTENT RUN below then.
COPY Dockerfile sr[c] /tmp/seed/
# The shared schemas and pricing rules live inside the backend tree
# (backend/src/shared) and compile as part of the backend's own tsc build —
# no package artifacts or workspace symlinks. tsc is invoked directly:
# `pnpm run` re-resolves the manifest, whose workspace state cannot resolve
# outside a workspace.
RUN ./node_modules/.bin/tsc -b
ARG SEED_CONTENT=0
RUN if [ "$SEED_CONTENT" = "1" ]; then \
      mkdir -p /app/src && mv /tmp/seed/content /app/src/content && mv /tmp/seed/assets /app/src/assets; \
    fi && rm -rf /tmp/seed

CMD ["node", "dist/index.js"]
