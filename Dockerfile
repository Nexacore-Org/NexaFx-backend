# ---- Builder ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --include=dev
COPY . ./
RUN npm run build

# ---- Runner ----
FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=builder /app/dist ./dist
# Create non-root user
RUN addgroup -S nestapp && adduser -S nestapp -G nestapp
USER nestapp
EXPOSE 3000
CMD ["node", "dist/main"]
