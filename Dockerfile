ARG RUN

FROM node:24-alpine@sha256:5fa278c599dbba0c8f873d8717d50ecbb57c5ae6a53b7ab240c25135e0b65995 as builder

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

FROM node:24-alpine@sha256:5fa278c599dbba0c8f873d8717d50ecbb57c5ae6a53b7ab240c25135e0b65995

WORKDIR /app

COPY --from=builder /app /app

ENTRYPOINT [ "./entrypoint.sh" ]
