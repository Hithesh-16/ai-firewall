FROM node:20-alpine AS builder

WORKDIR /app

COPY proxy/package*.json ./proxy/
RUN cd proxy && npm ci --production=false

COPY proxy/ ./proxy/
RUN cd proxy && npm run build

COPY dashboard/package*.json ./dashboard/
RUN cd dashboard && npm ci --production=false

COPY dashboard/ ./dashboard/
RUN cd dashboard && npm run build

FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache curl

COPY --from=builder /app/proxy/package*.json ./proxy/
RUN cd proxy && npm ci --omit=dev

COPY --from=builder /app/proxy/dist/ ./proxy/dist/
COPY --from=builder /app/proxy/policy.json ./proxy/policy.json
COPY proxy/.env.example ./proxy/.env.example

COPY --from=builder /app/dashboard/dist/ ./dashboard/dist/

RUN mkdir -p /app/data

ENV PORT=8080
ENV DB_PATH=/app/data/firewall.db
ENV NODE_ENV=production

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD curl -f http://localhost:8080/health || exit 1

CMD ["node", "proxy/dist/server.js"]
