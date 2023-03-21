import { PassThrough } from 'stream'
import { v4 as uuid } from 'uuid'
import multer from 'multer'
import { Request } from 'express'
import { ACL, MAX_FILE_SIZE, moveFile, uploadFile } from './s3'
import { GetFileKey, UploaderOptions, MulterFile } from './types'

export function getUploader({
  getFileKey,
  getFileStreamKey,
  maxFileSize = MAX_FILE_SIZE,
  mimeTypes,
}: UploaderOptions = {}) {
  let options: multer.Options = {
    limits: {
      fileSize: maxFileSize,
    },
    storage: new Storage(
      getFileKey || defaultGetFileKey,
      getFileStreamKey,
      mimeTypes
    ),
  }
  return multer(options)
}

class Storage implements multer.StorageEngine {
  constructor(
    public getFileKey: GetFileKey,
    public getFileStreamKey?: GetFileKey,
    public validMimeTypes?: string[]
  ) {}

  getKey(file: MulterFile, req: Request) {
    // If "getFileStreamKey" is defined, we need to create a new PassThrough stream since the function
    // will need a stream to read from. If not, we assume the function won't use a stream to generate the key.
    return this.getFileStreamKey
      ? this.getFileStreamKey(
          {
            ...file,
            stream: file.stream.pipe(new PassThrough()),
          },
          req
        )
      : this.getFileKey(file, req)
  }

  async _handleFile(
    req: Request,
    file: MulterFile,
    callback: (error?: any, info?: Partial<MulterFile>) => void
  ): Promise<void> {
    if (!isValidMimeType(file.mimetype, this.validMimeTypes)) {
      return callback(
        new Error(`Invalid file type ${file.mimetype} for ${file.fieldname}.`)
      )
    }

    // The upload key will be a unique UUID first so it can be later renamed (copy + delete in S3) or deleted to the file key we obtained.
    // We do it this way because we want to avoid having files in memory for each upload, but we need to read the file stream to hash it.
    // That means that we cant hash first and upload later, we need to do it on the same stream read
    const id = uuid()

    // The original stream comes from file.stream. The reading of the stream is kicked of when we pipe it into the first PassThrough
    // This allows for both operations, the upload and the file key generation to be done "simultaneously" without keeping the entire stream data in memory

    const uploadStream = file.stream.pipe(new PassThrough())

    const [key] = await Promise.all([
      this.getKey(file, req),
      uploadFile(id, uploadStream, ACL.publicRead),
    ])

    // move file to key
    await moveFile(id, key)

    callback(null, {
      fieldname: key,
    })
  }

  async _removeFile(
    _req: Request,
    _file: MulterFile,
    callback: (error: Error | null) => void
  ): Promise<void> {
    callback(null)
  }
}

function isValidMimeType(
  mimeTypeToCheck: string,
  validMimeTypes: string[] = [mimeTypeToCheck]
) {
  return validMimeTypes
    .map((mimeType) => mimeType.toLowerCase())
    .includes(mimeTypeToCheck.toLowerCase())
}

const defaultGetFileKey: GetFileKey = async (file) => {
  return file.fieldname
}
