# latest official node image
FROM node:10.15.1

RUN apt-get update && apt-get upgrade -y && apt-get install

# use cached layer for node modules
ADD package.json /tmp/package.json
RUN cd /tmp && npm install --unsafe-perm
RUN mkdir -p /usr/src/app && cp -a /tmp/node_modules /usr/src/app/

# add project files
ADD . /usr/src/app
ADD package.json /usr/src/app/package.json
WORKDIR /usr/src/app

CMD npm run start
