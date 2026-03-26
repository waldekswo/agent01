FROM node:20-alpine AS builder
WORKDIR /app
COPY mcp/memory/package*.json ./
RUN npm install
COPY mcp/memory/src ./src
COPY mcp/memory/tsconfig.json ./tsconfig.json
COPY tsconfig.json /tsconfig.json
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
COPY mcp/memory/package*.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["npm", "start"]
