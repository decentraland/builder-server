ARG RUN

FROM node:24.12.0-alpine as builder

WORKDIR /app

# The catalyst client lib is using a dependency installed by using git
RUN apk add --no-cache git python3 build-base

COPY package.json /app/package.json
COPY package-lock.json /app/package-lock.json
COPY tsconfig.json /app/tsconfig.json

RUN npm install

COPY . /app

RUN npm run build

FROM node:24.12.0-alpine

WORKDIR /app

COPY --from=builder /app /app

ENTRYPOINT [ "./entrypoint.sh" ]
