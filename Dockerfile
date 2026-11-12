ARG RUN

FROM node:24.22.3-alpine3.24@sha256:98e4e60b35fd50143e1838da2957488c25aa3a3efbd48bb679923f77d6d3d873 AS builder

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

FROM node:24.22.3-alpine3.24@sha256:98e4e60b35fd50143e1838da2957488c25aa3a3efbd48bb679923f77d6d3d873

WORKDIR /app

COPY --from=builder /app /app

ENTRYPOINT [ "./entrypoint.sh" ]
