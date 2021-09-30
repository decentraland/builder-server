ARG RUN

FROM node:14 as builderenv

WORKDIR /app

# some packages require a build step
RUN apt-get update
RUN apt-get -y -qq install python-setuptools python-dev build-essential

# We use Tini to handle signals and PID1 (https://github.com/krallin/tini, read why here https://github.com/krallin/tini/issues/8)
ENV TINI_VERSION v0.19.0
ADD https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini /tini
RUN chmod +x /tini

# install dependencies
COPY package.json /app/package.json
COPY package-lock.json /app/package-lock.json
RUN npm ci

# build the app
COPY . /app
RUN npm run build

# remove devDependencies, keep only used dependencies
RUN npm ci --only=production

########################## END OF BUILD STAGE ##########################

FROM node:lts

# NODE_ENV is used to configure some runtime options, like JSON logger
ENV NODE_ENV production

WORKDIR /app
COPY --from=builderenv /app /app
COPY --from=builderenv /tini /tini
# Please _DO NOT_ use a custom ENTRYPOINT because it may prevent signals
# (i.e. SIGTERM) to reach the service
# Read more here: https://aws.amazon.com/blogs/containers/graceful-shutdowns-with-ecs/
#            and: https://www.ctl.io/developers/blog/post/gracefully-stopping-docker-containers/
ENTRYPOINT ["/tini", "--"]
# Run the program under Tini
CMD [ "/bin/sh", "entrypoint.sh" ]


# ARG RUN

# FROM node:12-alpine as builder

# WORKDIR /app

# # The catalyst client lib is using a dependency installed by using git
# RUN apk update
# RUN apk add git

# COPY package.json /app/package.json
# COPY package-lock.json /app/package-lock.json
# COPY tsconfig.json /app/tsconfig.json

# RUN npm ci

# COPY . /app

# RUN npm run build

# FROM node:12-alpine

# WORKDIR /app

# COPY --from=builder /app /app

# ENTRYPOINT [ "./entrypoint.sh" ]
