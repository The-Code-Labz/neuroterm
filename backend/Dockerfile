FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache \
  tmux \
  git \
  curl \
  openssh-client \
  python3 \
  make \
  g++ \
  build-base \
  bash

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=3001
ENV DB_PATH=/data/neuroterm.sqlite

VOLUME ["/data", "/workspace"]
EXPOSE 3001

CMD ["node", "dist/index.js"]
