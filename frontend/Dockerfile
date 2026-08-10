FROM node:22-bookworm-slim AS base
WORKDIR /app
COPY package*.json ./
RUN npm install

FROM base AS development
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
