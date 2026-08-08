FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY web/package*.json ./web/
RUN npm --prefix web install

COPY . .
RUN npm --prefix web run build && rm -rf web/node_modules web/src

ENV DATA_DIR=/data
VOLUME /data
EXPOSE 80 443

CMD ["node", "server/index.js"]
