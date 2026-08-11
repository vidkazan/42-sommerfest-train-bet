# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS base
WORKDIR /app
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

FROM base AS development
COPY tsconfig.json ./
COPY src ./src

FROM base AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM base AS production
WORKDIR /app
ENV NODE_ENV=production
RUN npm prune --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
CMD ["npm", "run", "start"]
