# syntax=docker/dockerfile:1

# ---- Builder stage: install all deps (incl. dev) and compile TypeScript ----
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first for better layer caching.
# Copy manifests and lockfile only, then run a clean install.
COPY package.json package-lock.json ./
RUN npm ci

# Copy the rest of the source and build.
COPY . .
RUN npm run build

# ---- Runner stage: minimal production image ----
FROM node:20-alpine AS runner

ENV NODE_ENV=production
WORKDIR /app

# Install only production dependencies into a clean tree.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy the compiled output from the builder stage.
COPY --from=builder /app/dist ./dist

# Run as a non-root user. The node image ships with a `node` user (uid 1000).
USER node

EXPOSE 3000

# Start the compiled application entrypoint.
CMD ["node", "dist/main"]
