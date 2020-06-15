FROM node:12-alpine

WORKDIR /app

COPY package.json /app/package.json
COPY package-lock.json /app/package-lock.json

RUN apk update && \
    apk --no-cache add git && \
    npm install --unsafe-perm && \
    rm -rf /var/cache/apk/*

COPY . /app

ENTRYPOINT [ "./entrypoint.sh" ]
