FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .

# Build the production static bundles
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]
