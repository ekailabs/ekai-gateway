# ---------- build base ----------
  FROM node:20 AS build-base
  WORKDIR /app
  
  # Copy manifests for cache-friendly installs
  COPY package.json package-lock.json ./
  COPY gateway/package.json gateway/package-lock.json ./gateway/
  COPY ui/dashboard/package.json ui/dashboard/package-lock.json ./ui/dashboard/
  
  # Install deps per project (no workspaces)
  RUN npm install
  RUN cd gateway && npm install
  RUN cd ui/dashboard && npm install
  
  # Copy the rest of the source
  COPY . .
  
  # ---------- gateway build ----------
  FROM build-base AS gateway-build
  WORKDIR /app/gateway
  RUN npm run build
  # Ensure schema.sql ships with compiled code
  RUN if [ -f src/db/schema.sql ]; then mkdir -p dist/db && cp src/db/schema.sql dist/db/schema.sql; fi
  
  # ---------- dashboard build ----------
  FROM build-base AS dashboard-build
  WORKDIR /app/ui/dashboard
  # For smaller runtime images, you could: RUN npm run build && npm prune --omit=dev
  RUN npm run build
  
  # ---------- gateway runtime ----------
  FROM node:20-alpine AS gateway-runtime
  WORKDIR /app/gateway
  ENV NODE_ENV=production
  COPY gateway/package.json gateway/package-lock.json ./
  RUN npm install --omit=dev
  COPY --from=gateway-build /app/gateway/dist ./dist
  # Optional runtime dirs
  RUN mkdir -p /app/gateway/data /app/gateway/logs
  EXPOSE 3001
  CMD ["node", "dist/gateway/src/index.js"]
  
  # ---------- dashboard runtime ----------
  FROM node:20-alpine AS dashboard-runtime
  WORKDIR /app/ui/dashboard
  ENV NODE_ENV=production
  COPY ui/dashboard/package.json ui/dashboard/package-lock.json ./
  RUN npm install --omit=dev
  # Copy production build output
  COPY --from=dashboard-build /app/ui/dashboard/.next ./.next
  COPY --from=dashboard-build /app/ui/dashboard/public ./public
  # Copy config files
  COPY --from=dashboard-build /app/ui/dashboard/next.config.ts ./next.config.ts
  COPY --from=dashboard-build /app/ui/dashboard/postcss.config.mjs ./postcss.config.mjs
  EXPOSE 3000
  CMD ["npx", "next", "start", "-p", "3000"]
  
  # ---------- fullstack runtime ----------
  FROM node:20-alpine AS fullstack-runtime
  WORKDIR /app
  ENV NODE_ENV=production
  
  # Gateway runtime bits
  COPY gateway/package.json gateway/package-lock.json ./gateway/
  RUN cd gateway && npm install --omit=dev
  COPY --from=gateway-build /app/gateway/dist ./gateway/dist
  RUN mkdir -p /app/gateway/data /app/gateway/logs
  
  # Dashboard runtime bits
  COPY ui/dashboard/package.json ui/dashboard/package-lock.json ./ui/dashboard/
  RUN cd ui/dashboard && npm install --omit=dev
  COPY --from=dashboard-build /app/ui/dashboard/.next ./ui/dashboard/.next
  COPY --from=dashboard-build /app/ui/dashboard/public ./ui/dashboard/public
  COPY --from=dashboard-build /app/ui/dashboard/next.config.ts ./ui/dashboard/next.config.ts
  COPY --from=dashboard-build /app/ui/dashboard/postcss.config.mjs ./ui/dashboard/postcss.config.mjs
  
  # Entrypoint for running both services
  COPY scripts/start-fullstack.sh /app/start-fullstack.sh
  RUN chmod +x /app/start-fullstack.sh
  
  EXPOSE 3001 3000
  VOLUME ["/app/gateway/data", "/app/gateway/logs"]
  CMD ["/app/start-fullstack.sh"]
  
