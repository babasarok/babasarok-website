# Built on the ARM64 box (CAX21); the Cloudflare build has no Docker daemon,
# so the deploy ships the source and the box builds this image.
FROM node:24-slim

WORKDIR /workspace

# Workspace manifests first so dependency install is a cached layer.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY backend/package.json ./backend/
COPY packages/product-definition/package.json packages/product-definition/tsconfig.json ./packages/product-definition/

# `pnpm deploy` installs only the backend's dependencies into an isolated
# directory; a filtered `pnpm install` would also install the workspace
# root's (site) dependencies.
RUN npm install -g pnpm@12.15.0 \
  && pnpm --filter babasarok-vendure-backend deploy --ignore-scripts /app/backend \
  && rm -rf /workspace

WORKDIR /app/backend
COPY backend/ ./
# The preview seed reads the Tina material content from the repo tree;
# the deploy tar ships the content dirs plus exactly the assets the
# content references (a local build of the full tree copies all of
# src/assets). TEMPORARY and preview-only — prod never runs the seed
# (hand-migration at cutover); drop these COPYs then.
COPY src/content/material /app/src/content/material
COPY src/content/product /app/src/content/product
COPY src/content/product_groups /app/src/content/product_groups
COPY src/assets /app/src/assets
# The shared package must exist at the reference path backend's tsconfig
# points to, and its runtime import must resolve: the packed copy from
# `pnpm deploy` has no dist, so it is replaced by a symlink to the copied
# source. The source sits outside /app/backend, so it installs its own
# dependencies (zod is not on its node_modules lookup path otherwise) and
# `tsc -b` compiles it as a referenced project straight to dist. tsc is
# invoked directly: `pnpm run` first re-resolves the manifest, whose
# workspace:* dependency cannot resolve outside a workspace.
COPY packages/product-definition /app/packages/product-definition
RUN pnpm -C /app/packages/product-definition install --ignore-scripts \
  && rm -rf node_modules/@babasarok/product-definition \
  && ln -s /app/packages/product-definition node_modules/@babasarok/product-definition \
  && ./node_modules/.bin/tsc -b

CMD ["node", "dist/index.js"]
