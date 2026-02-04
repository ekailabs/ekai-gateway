# ---------- build stage ----------
FROM node:20 AS build
WORKDIR /app

# Copy manifests for cache-friendly installs
COPY package.json package-lock.json ./
COPY gateway/package.json gateway/package-lock.json ./gateway/

# Install deps
RUN npm install
RUN cd gateway && npm install

# Copy the rest of the source
COPY . .

# Build gateway
WORKDIR /app/gateway
RUN npm run build
# Ensure schema.sql ships with compiled code
RUN if [ -f src/db/schema.sql ]; then mkdir -p dist/db && cp src/db/schema.sql dist/db/schema.sql; fi

# ---------- runtime ----------
FROM node:20-alpine
WORKDIR /app/gateway

ENV NODE_ENV=production

COPY gateway/package.json gateway/package-lock.json ./
RUN npm install --omit=dev

COPY --from=build /app/gateway/dist ./dist

# Runtime dirs
RUN mkdir -p /app/gateway/data /app/gateway/logs

EXPOSE 3001
VOLUME ["/app/gateway/data", "/app/gateway/logs"]

CMD ["node", "dist/gateway/src/index.js"]
