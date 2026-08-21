FROM node:24.18.0-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build:release
FROM node:24.18.0-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-api ./dist-api
COPY --from=build /app/database ./database
EXPOSE 8787
CMD ["node", "dist-api/server.mjs"]
