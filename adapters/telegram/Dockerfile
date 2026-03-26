FROM node:20-alpine AS builder
WORKDIR /app
COPY adapters/telegram/package*.json ./
RUN npm install
COPY adapters/telegram/src ./src
COPY adapters/telegram/tsconfig.json ./tsconfig.json
COPY tsconfig.json /tsconfig.json
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
COPY adapters/telegram/package*.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["npm", "start"]
