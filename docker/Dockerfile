FROM node:20-bookworm-slim AS builder

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates curl wget gnupg \
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
RUN npm run build:api
ARG SUB_PATH=
ENV SUB_PATH=${SUB_PATH}
ENV VITE_ROUTER_MODE=browser
RUN npm run build:ui
RUN test -f /app/interface/dist/index.html

FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates curl wget gnupg tar gzip zstd lz4 default-mysql-client \
  && install -d /etc/apt/keyrings \
  && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor --yes -o /etc/apt/keyrings/postgresql.gpg \
  && echo "deb [signed-by=/etc/apt/keyrings/postgresql.gpg] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends postgresql-client-16 \
  && ln -sf /usr/lib/postgresql/16/bin/pg_dump /usr/local/bin/pg_dump \
  && ln -sf /usr/lib/postgresql/16/bin/pg_restore /usr/local/bin/pg_restore \
  && pg_dump --version \
  && pg_restore --version \
  && mysqldump --version \
  && mysql --version \
  && zstd --version \
  && lz4 --version \
  && tar --version >/dev/null \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/config ./config
COPY --from=builder /app/interface/dist ./public

EXPOSE 3000

CMD ["sh", "-c", "npm run db:deploy && node dist/index.js"]
