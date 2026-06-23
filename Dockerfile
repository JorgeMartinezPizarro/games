# --------------------
# BUILD STAGE
# --------------------
FROM node:22.12 AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .

RUN npm run build


# --------------------
# RUNTIME STAGE
# --------------------
FROM node:22.12-slim

WORKDIR /app

ENV NODE_ENV=production

# solo lo necesario para runtime
COPY package*.json ./
RUN npm install --omit=dev --legacy-peer-deps

# copiar build output
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.* ./

EXPOSE 3000

CMD ["npm", "run", "start"]