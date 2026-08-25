# syntax=docker/dockerfile:1

FROM node:22.23.2-bookworm-slim
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
ENV NODE_OPTIONS=--dns-result-order=ipv4first \
    NPM_CONFIG_FETCH_RETRIES=10 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000 \
    NPM_CONFIG_MAXSOCKETS=1
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev \
    && npm install typescript@5.1.3 --save-prod
ENV NODE_ENV=production
COPY dist ./dist
RUN chown -R node:node /app
USER node
EXPOSE 8000
CMD ["node", "dist/main.js"]

