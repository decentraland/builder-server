ARG RUN

FROM node:14-alpine as builder

WORKDIR /app

# The catalyst client lib is using a dependency installed by using git
RUN apk update
RUN apk add git

COPY package.json /app/package.json
COPY package-lock.json /app/package-lock.json
COPY tsconfig.json /app/tsconfig.json

RUN npm ci

COPY . /app

RUN npm run build

FROM node:14-alpine

WORKDIR /app

COPY --from=builder /app /app

ENTRYPOINT [ "./entrypoint.sh" ]
