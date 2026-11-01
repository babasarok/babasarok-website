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
# The shared package must exist at the reference path backend's tsconfig
# points to, and its runtime import must resolve: the packed copy from
# `pnpm deploy` has no dist, so it is replaced by a symlink to the copied
# source, which `tsc -b` builds as a referenced project.
COPY packages/product-definition /app/packages/product-definition
RUN rm -rf node_modules/@babasarok/product-definition \
  && ln -s /app/packages/product-definition node_modules/@babasarok/product-definition \
  && pnpm run build

CMD ["node", "dist/index.js"]
