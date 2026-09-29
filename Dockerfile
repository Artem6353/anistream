# AniStream web: next build + start
# Аудит 30.09 (P1-10): .dockerignore добавлен (раньше COPY . . утаскивал .git и
# .env.local в builder-слой); в runner — только prod-зависимости; процессы от node,
# не от root; data/.cache создаются с нужным владельцем (рантайм-записи report/dmca/vapid).
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Prod-зависимости отдельно: без typescript/playwright/vitest (образ в разы меньше).
FROM node:20-alpine AS deps-prod
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN mkdir -p /app/data /app/.cache && chown -R node:node /app
COPY --from=deps-prod --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/lib ./lib
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/next.config.ts ./next.config.ts
USER node
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start"]
