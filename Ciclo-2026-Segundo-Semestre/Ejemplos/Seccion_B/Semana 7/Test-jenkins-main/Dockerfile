# ---------- Dependencias ----------
FROM node:18-alpine AS deps

WORKDIR /app

COPY package*.json ./

RUN npm install

# ---------- Build ----------
FROM node:18-alpine AS build

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# ---------- Producción ----------
FROM node:18-alpine AS prod

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/main.js"]