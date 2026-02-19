FROM node:20-alpine AS builder

ARG APP_NAME=parent
ARG APP_PORT=3000

WORKDIR /app

# Copy all package files for workspace resolution
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY apps/admin/package*.json ./apps/admin/
COPY apps/parent/package*.json ./apps/parent/

# Install all dependencies
RUN npm ci

# Copy source code
COPY packages/shared ./packages/shared
COPY apps ./apps

# Build the specified app (shared package is used as TypeScript source)
RUN npm run build --workspace=apps/${APP_NAME}

# Production stage
FROM node:20-alpine

ARG APP_NAME=parent
ARG APP_PORT=3000

WORKDIR /app

RUN npm install -g serve

COPY --from=builder /app/apps/${APP_NAME}/dist ./dist

ENV PORT=3000
EXPOSE 3000

CMD ["sh", "-c", "serve -s dist -l ${PORT:-3000}"]
