FROM node:20-alpine AS builder

WORKDIR /app

# Copy package and lock files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code and prisma schema
COPY . .

# Generate prisma client
RUN npx prisma generate

# Build TypeScript code
RUN npm run build

FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

ENV PORT=3001
ENV NODE_ENV=production

EXPOSE 3001

CMD ["npm", "run", "start"]
