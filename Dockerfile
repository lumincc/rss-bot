FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN mkdir -p data

EXPOSE 8000

CMD ["npx", "tsx", "src/app.ts"]
