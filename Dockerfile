FROM node:22-slim AS builder

WORKDIR /app

COPY package.json tsconfig.json ./
RUN npm install

COPY src/ ./src/
RUN npm run build

FROM node:22-slim

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
# schema.sql is read at runtime by db/client.ts
COPY src/db/schema.sql ./dist/db/schema.sql

# API server port
EXPOSE 3001

ENTRYPOINT ["node", "dist/index.js"]
