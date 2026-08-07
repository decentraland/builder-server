ARG RUN

FROM node:24.18.0-alpine3.24@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS builder

WORKDIR /app

# The catalyst client lib is using a dependency installed by using git
RUN apk update
RUN apk add git python3 build-base

COPY package.json /app/package.json
COPY package-lock.json /app/package-lock.json
COPY tsconfig.json /app/tsconfig.json

RUN npm install

COPY . /app

RUN npm run build

FROM node:24.18.0-alpine3.24@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd

WORKDIR /app

COPY --from=builder /app /app

ENTRYPOINT [ "./entrypoint.sh" ]
