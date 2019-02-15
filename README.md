# Builder contest server

Exposes endpoints for the builder contest

## API

`POST /entry`

Upload a entry to the S3 bucket. You can check the [`Entry` type](https://github.com/decentraland/builder-contest-server/blob/master/src/Contest/types.ts) to see how it looks.

Sensitive information will be encrypted if the SECRET (env variable) is set.

`GET /entry/:projectId`

Gets a entry by id.

Sensitive information will be decrypted if the SECRET (env variable) is set.

## RUN

Check `.env.example` and create your own `.env` file. Some properties have defaults.

```bash
cp .env.example .env
vim .env # fill variables
npm i
npm start
```
