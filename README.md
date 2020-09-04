# Builder Server

Exposes endpoints for the Builder.

## RUN

Check `.env.example` and create your own `.env` file. Some properties have defaults.

```bash
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

- `GET /storage/assetPacks/:filename` => https://s3.amazonaws.com/nico.decentraland.zone/asset_packs/:filename (for the thumbnail, :id.png)
- `GET /storage/contents/:hash` => https://s3.amazonaws.com/nico.decentraland.zone/contents/:hash

# Also S3 but behind auth

- `GET /projects/:id/manifest` => https://s3.amazonaws.com/nico.decentraland.zone/projects/:id/manifest.json
- `GET /pools/:id/manifest` => https://s3.amazonaws.com/nico.decentraland.zone/projects/:id/pool.json
- `GET /projects/:id/media/:filename` => https://s3.amazonaws.com/nico.decentraland.zone/projects/:id/filename

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
