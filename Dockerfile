FROM node:16.4.0

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm install --porduction

COPY . .

EXPOSE 4000

CMD npm start

