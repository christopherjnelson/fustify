# syntax=docker/dockerfile:1.7

FROM node:24.18.0-alpine3.23 AS build

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .

ARG SUPABASE_PUBLISHABLE_KEY
RUN test -n "${SUPABASE_PUBLISHABLE_KEY}"
ENV VITE_SUPABASE_URL=same-origin
ENV VITE_SUPABASE_PUBLISHABLE_KEY=${SUPABASE_PUBLISHABLE_KEY}
ENV FUSTIFY_RELEASE_ID=lan
RUN pnpm build:release

FROM node:24.18.0-alpine3.23 AS api

WORKDIR /app
COPY --from=build --chown=node:node /app/.fustify/release/api ./api
USER node
EXPOSE 8787
CMD ["node", "api/server.mjs"]

FROM caddy:2.10.2-alpine AS gateway

COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/.fustify/release/web /srv/fustify/web
EXPOSE 8080
