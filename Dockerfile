# مرحله‌ی build — کامپایل TypeScript
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# مرحله‌ی نهایی — فقط چیزی که برای اجرا لازمه
FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
ENV MCP_TRANSPORT_TYPE=http

COPY package*.json ./
RUN npm install --omit=dev
COPY --from=build /app/build ./build

EXPOSE 3011
CMD ["node", "build/index.js"]