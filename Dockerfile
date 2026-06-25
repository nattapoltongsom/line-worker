# Stage 1: Install dependencies
FROM node:20-slim AS deps

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm install tsx

# Stage 2: Copy source และ run
FROM node:20-slim AS runner

WORKDIR /app

# Copy dependencies จาก stage ก่อนหน้า
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

# ไม่มี EXPOSE — ไม่ใช่ HTTP server
# รันด้วย tsx เพื่อ run TypeScript โดยตรง
CMD ["node", "--import", "tsx", "src/index.ts"]
