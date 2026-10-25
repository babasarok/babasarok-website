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
# The dashboard build introspects vendure-config.ts, which parses env at
# import time — and vite build sets NODE_ENV=production for that import, so
# the placeholders must satisfy env.ts's production gates. They are never
# used at runtime.
RUN DATABASE_URL=postgres://build:build@localhost/build \
  TOKEN_SECRET=build-only-placeholder-secret \
  SHOP_OWNER_EMAIL=build@example.com \
  ORDER_EMAIL_FROM=build@example.com \
  EMAIL_TRANSPORT=smtp \
  SMTP_HOST=build.invalid \
  SUPERADMIN_EMAIL=build@example.com \
  SUPERADMIN_PASSWORD=build-only-placeholder \
  pnpm -C backend run build

WORKDIR /app/backend
CMD ["node", "dist/index.js"]
