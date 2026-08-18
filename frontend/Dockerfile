# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS base
WORKDIR /app
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

FROM base AS development
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src

FROM base AS build
ARG VITE_API_BASE_URL=http://localhost:3001
ARG VITE_BASE_PATH=/
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_BASE_PATH=$VITE_BASE_PATH
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
RUN npm run build

FROM base AS production
WORKDIR /app
ENV NODE_ENV=production
RUN npm prune --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "5173"]
