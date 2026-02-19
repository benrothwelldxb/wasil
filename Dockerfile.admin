FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package files
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY apps/admin/package*.json ./apps/admin/

# Install all dependencies from root
RUN npm install

# Copy source code
COPY packages/shared ./packages/shared
COPY apps/admin ./apps/admin

# Build shared package first, then admin app
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=apps/admin

# Production stage
FROM node:20-alpine
WORKDIR /app

RUN npm install -g serve

COPY --from=builder /app/apps/admin/dist ./dist

EXPOSE 3001
CMD ["serve", "-s", "dist", "-l", "3001"]
