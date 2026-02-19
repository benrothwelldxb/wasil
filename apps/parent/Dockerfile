FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package files
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY apps/parent/package*.json ./apps/parent/

# Install all dependencies from root
RUN npm install

# Copy source code
COPY packages/shared ./packages/shared
COPY apps/parent ./apps/parent

# Build shared package first, then parent app
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=apps/parent

# Production stage
FROM node:20-alpine
WORKDIR /app

RUN npm install -g serve

COPY --from=builder /app/apps/parent/dist ./dist

EXPOSE 3000
CMD ["serve", "-s", "dist", "-l", "3000"]
