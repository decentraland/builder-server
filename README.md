# Builder Server

Exposes endpoints for the Builder.

## RUN

Check `.env.example` and create your own `.env` file. Some properties have defaults.

```bash

#Create database (Only the first time)
createdb <DatabaseName>

# Update env. The DEFAULT_USER_ID is important

# Update state
npm i
npm run migrate up

# Only once
npx ts-node ./scripts/parseS3Pools.ts
npx ts-node ./scripts/updateProjectThumbnails.ts

# On each asset pack change
npm run seed

# Start
npm start
```

# Rewrites to S3

- `GET /v1/storage/assetPacks/:filename` => https://s3.amazonaws.com/nico.decentraland.zone/asset_packs/:filename (for the thumbnail, :id.png)
- `GET /v1/storage/contents/:hash` => https://s3.amazonaws.com/nico.decentraland.zone/contents/:hash

# Also S3 but behind auth

- `GET /v1/projects/:id/manifest` => https://s3.amazonaws.com/nico.decentraland.zone/projects/:id/manifest.json
- `GET /v1/pools/:id/manifest` => https://s3.amazonaws.com/nico.decentraland.zone/projects/:id/pool.json
- `GET /v1/projects/:id/media/:filename` => https://s3.amazonaws.com/nico.decentraland.zone/projects/:id/filename

Take into account that `/v1/` correspond to the version that you specify in the file `.env` with `API_VERSION`

# S3 structure

```bash
projects
|____PROJECT_ID
| |____manifest.json
| |____pool.json
| |____east.png
| |____north.png
| |____preview.png
| |____south.png
| |____thumbnail.png
| |____west.png
asset_packs
|____ASSET_PACK_ID.png
contents
|____HASH1
|____HASH2
|____HASH3
```

#Extra Info
If you are using windows subsystem, you will need to start the postgresql service each time

`sudo service postgresql start`

# Running external services locally with Docker Compose

If you have docker running on your machine and want to have external dependencies running locally on your machine,
you can use the `docker-compose` file present in the repo to do it in a simple and centralized way and avoid the hassle of
configuring each one of them independantly.

First, run all services simultaneously with:

`docker-compose up -d`

`-d or --detach` will run the processes on the background instead of running on the terminal which executed the command.
You can ignore this flag if you don't care about it.

Before running the `builder-server`, make sure that the following `.env` variables are set correctly so the services run by docker-compose work as expected.

```
CONNECTION_STRING='postgres://admin:password@localhost:5432/builder-server'
AWS_ACCESS_KEY=admin
AWS_ACCESS_SECRET=password
AWS_BUCKET_NAME=builder-server
AWS_STORAGE_URL=http://localhost:9000
```

You can then run the `builder-service` normally as instructed in [RUN](#run)

This method also provides some utilities to facilitate developer experience with a database viewer that can be accessed in http://localhost:8080, as well as an object storage viewer in http://localhost:9001

# Use a local development scene for the Builder preview

The builder uses a javascript file compiled from the [asset-packs](https://github.com/decentraland/asset-packs) repo to make the items work once deployed. 

If you are developing this javascript locally and want the builder server to serve that file instead of the one in the asset packs CDN, you can use these two env variables:

```
DEV_SCENE_JS_PATH=/path/to/bin/index.js
DEV_SCENE_JS_PORT=8000
```

The first one is the path to the `bin/index.js` generated when automatically when running the `npm start` command in the [asset-packs](https://github.com/decentraland/asset-packs) repo. 
That command also starts a local dev server, by default on port 8000, but could be a different one if you already have something running on that port. The correct port should be used as the value of the second env variable.