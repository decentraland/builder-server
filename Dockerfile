FROM node:12-alpine

WORKDIR /app

COPY . /app

RUN apk update && \
    apk --no-cache upgrade && \
    apk --no-cache add git && \
    npm install --unsafe-perm && \
    rm -rf /var/cache/apk/*

ENTRYPOINT [ "./entrypoint.sh" ]
