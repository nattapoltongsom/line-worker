FROM node:20-slim
WORKDIR /app
COPY package.json ./
RUN npm install
COPY server.ts ./
CMD ["node", "--import", "tsx", "server.ts"]
