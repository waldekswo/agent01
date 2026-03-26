FROM node:20-alpine AS builder
WORKDIR /app
COPY mcp/graph/package*.json ./
RUN npm install
COPY mcp/graph/src ./src
COPY mcp/graph/tsconfig.json ./tsconfig.json
COPY tsconfig.json /tsconfig.json
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
COPY mcp/graph/package*.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["npm", "start"]
