# --------------------
# BUILD STAGE
# --------------------
FROM node:22.12 AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

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
RUN npm install --omit=dev

COPY run.js ./

# copiar build output
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.* ./

EXPOSE 3000

CMD ["npm", "run", "start"]