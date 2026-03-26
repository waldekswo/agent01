FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY src ./src
COPY tsconfig.json ./

# Build
RUN npm run build

# Runtime
EXPOSE 3000
CMD ["npm", "start"]
