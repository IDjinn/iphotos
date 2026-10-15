# syntax=docker/dockerfile:1
# Production image for the web client: a minimal Next.js standalone server.
# NEXT_PUBLIC_API_URL is inlined into the client bundle at build time, so the
# public origin must be passed via --build-arg (compose.vps.yaml does it from
# backend/.env IPHOTOS_PUBLIC_URL).

FROM oven/bun:1.3-alpine AS deps
WORKDIR /app
# The desktop shell is not part of the web image: skip Electron's ~100 MB
# binary download triggered by its postinstall.
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Bun installs the dependency tree (bun.lock is the source of truth), but the
# build itself runs on Node: Bun's runtime segfaulted compiling this app on
# the VPS (bun 1.3.14, musl).
FROM node:22-alpine AS build
WORKDIR /app
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_STANDALONE=1 \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN node node_modules/next/dist/bin/next build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S nextjs && adduser -S nextjs -G nextjs
COPY --from=build --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nextjs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nextjs /app/public ./public
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
