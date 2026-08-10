# Be a Good Egg — single service: builds the SPA and runs the Hono API that
# serves it. Works on Railway (Dockerfile builder), Fly.io, Render, a VPS, etc.
FROM node:20-slim AS base
WORKDIR /app
ENV NODE_ENV=production

# Install all deps (build needs devDependencies like vite/tailwind/tsc).
COPY package.json package-lock.json ./
RUN npm ci

# Build the frontend. VITE_DATA_PROVIDER is baked in at build time, so default
# a self-hosted image to the API provider (override with --build-arg).
COPY . .
ARG VITE_DATA_PROVIDER=api
ENV VITE_DATA_PROVIDER=$VITE_DATA_PROVIDER
RUN npm run build

EXPOSE 8080
# The server runs the TypeScript entry with tsx (a production dependency).
CMD ["npm", "run", "start"]
