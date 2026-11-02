# Built on the ARM64 box (CAX21); the Cloudflare build has no Docker daemon,
# so the deploy ships the source and the box builds this image.
FROM node:24-slim

WORKDIR /workspace

# Workspace manifests first so dependency install is a cached layer.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY patches ./patches
COPY backend/package.json ./backend/
COPY packages/product-definition/package.json packages/product-definition/tsconfig.json ./packages/product-definition/
COPY packages/pricing/package.json packages/pricing/tsconfig.json ./packages/pricing/

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
# full tree copies all of src/assets). The content lands in the final image
# only when the build sets SEED_CONTENT=1 (the preview compose does; prod
# builds exclude it). Prod never runs the seed (hand-migration at cutover);
# drop this COPY pair and the SEED_CONTENT RUN below then.
COPY src/content /tmp/seed/content
COPY src/assets /tmp/seed/assets
# The shared package must exist at the reference path backend's tsconfig
# points to, and its runtime import must resolve: the packed copy from
# `pnpm deploy` has no dist, so it is replaced by a symlink to the copied
# source. The source sits outside /app/backend, so it installs its own
# dependencies (zod is not on its node_modules lookup path otherwise) and
# `tsc -b` compiles it as a referenced project straight to dist. tsc is
# invoked directly: `pnpm run` first re-resolves the manifest, whose
# workspace:* dependency cannot resolve outside a workspace. The pricing
# package only needs zod and the first package, so it gets those two links by
# hand instead of an install.
COPY packages/product-definition /app/packages/product-definition
COPY packages/pricing /app/packages/pricing
RUN pnpm -C /app/packages/product-definition install --ignore-scripts \
  && rm -rf node_modules/@babasarok/product-definition \
  && ln -s /app/packages/product-definition node_modules/@babasarok/product-definition \
  && mkdir -p /app/packages/pricing/node_modules/@babasarok \
  && ln -s /app/packages/product-definition /app/packages/pricing/node_modules/@babasarok/product-definition \
  && ln -s /app/packages/product-definition/node_modules/zod /app/packages/pricing/node_modules/zod \
  && rm -rf node_modules/@babasarok/pricing \
  && ln -s /app/packages/pricing node_modules/@babasarok/pricing \
  && ./node_modules/.bin/tsc -b
ARG SEED_CONTENT=0
RUN if [ "$SEED_CONTENT" = "1" ]; then \
      mkdir -p /app/src && mv /tmp/seed/content /app/src/content && mv /tmp/seed/assets /app/src/assets; \
    else rm -rf /tmp/seed; fi

CMD ["node", "dist/index.js"]
