# Stage 1: Install dependencies & build React dashboard
FROM oven/bun:1-slim AS builder

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install

COPY tsconfig.json tsconfig.server.json tsconfig.web.json ./
COPY shared ./shared
COPY web ./web

RUN bun run build:web

# Stage 2: Minimal runtime image
FROM oven/bun:1-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV DATA_DIR=/app/data
ENV PORT=8000
ENV HOST=0.0.0.0

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/web/dist ./web/dist
COPY tsconfig.json tsconfig.server.json ./
COPY shared ./shared
COPY server ./server

RUN mkdir -p /app/data

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD bun -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8000) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["bun", "run", "server/index.ts"]
