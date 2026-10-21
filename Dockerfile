ARG RUN

FROM node:24.22.1-alpine3.24@sha256:6a1c190e17215d844926b0677f4bf87273ff7d5e54db06d3b5b5863ab0b09a3d AS builder

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

FROM node:24.22.1-alpine3.24@sha256:6a1c190e17215d844926b0677f4bf87273ff7d5e54db06d3b5b5863ab0b09a3d

WORKDIR /app

COPY --from=builder /app /app

ENTRYPOINT [ "./entrypoint.sh" ]
