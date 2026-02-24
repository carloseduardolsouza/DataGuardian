FROM node:20-bookworm-slim AS builder

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates wget gnupg \
  && install -d /etc/apt/keyrings \
  && wget -qO- https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /etc/apt/keyrings/postgresql.gpg \
  && echo "deb [signed-by=/etc/apt/keyrings/postgresql.gpg] http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends postgresql-client-16 \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY interface/package*.json interface/

RUN npm ci
RUN npm ci --prefix interface

COPY tsconfig.json ./
COPY src ./src
COPY prisma ./prisma
COPY config ./config
COPY interface ./interface

RUN npm run db:generate
RUN npm run build

FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates wget \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/interface/package*.json interface/
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/interface/node_modules ./interface/node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/config ./config
COPY --from=builder /app/interface/dist ./public

EXPOSE 3000

CMD ["sh", "-c", "npm run db:deploy && node dist/index.js"]
