# Mock downstream server สำหรับ dev/test
FROM node:20-slim

WORKDIR /app
RUN npm init -y && npm install express tsx typescript @types/express @types/node

COPY server.ts auth-server.ts ./

EXPOSE 5001
CMD ["npx", "tsx", "server.ts"]
