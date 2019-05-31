# Builder Server

Exposes endpoints for the Builder.

## API

`POST /entry`

Upload a Contest Entry to the S3 bucket. You can check the Contest [`Entry` type](https://github.com/decentraland/builder-contest-server/blob/master/src/Contest/types.ts) to see how it looks.

Sensitive information will be encrypted if the SECRET (env variable) is set.

`GET /entry/:projectId`

Gets a contest entry by id.

Sensitive information will be decrypted if the SECRET (env variable) is set.

`POST /project`

Upload a Project Entry to the S3 bucket. You can check the Project [`Entry` type](https://github.com/decentraland/builder-contest-server/blob/master/src/Project/types.ts) to see how it looks.

Sensitive information will be encrypted if the SECRET (env variable) is set.

`POST /project/:projectId/preview`

Upload preview files associated with a Project.

Required field names as form-data:

- `image`
- `video`
- `thumb`
- `north`
- `east`
- `south`
- `west`

Supported mime/types:

- `image/png`
- `video/webm`

Notes:

- The Project must exist before uploading associated files.
- All the of required files must be posted for the request to be successful.
- File size limit is enforced and configured as 3 MB.

## RUN

Check `.env.example` and create your own `.env` file. Some properties have defaults.

```bash
cp .env.example .env
vim .env # fill variables
npm i
npm start
```
