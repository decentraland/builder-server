import { Request } from 'express'
import AWS from 'aws-sdk'
import multer from 'multer'
import multerS3 from 'multer-s3'
import mimeTypes from 'mime-types'
import { env, utils, Log } from 'decentraland-commons'

const ACCESS_KEY = env.get('AWS_ACCESS_KEY', '')
const ACCESS_SECRET = env.get('AWS_ACCESS_SECRET', '')
if (!ACCESS_KEY || !ACCESS_SECRET) {
  throw new Error(
    'You need to add an AWS key and secret to your env file. Check the .env.example file'
  )
}

const BUCKET_NAME = env.get('AWS_BUCKET_NAME', '')
if (!BUCKET_NAME) {
  throw new Error(
    'You need to add an AWS bucket name to your env file. Check the .env.example file'
  )
}

const MAX_FILE_SIZE = parseInt(env.get('AWS_MAX_FILE_SIZE', ''), 10) || 10000000

const STORAGE_URL = env.get('AWS_STORAGE_URL', undefined)

export const ACL = {
  private: 'private' as 'private',
  publicRead: 'public-read' as 'public-read',
  publicReadWrite: 'public-read-write' as 'public-read-write',
  authenticatedRead: 'authenticated-read' as 'authenticated-read',
  awsExecRead: 'aws-exec-read' as 'aws-exec-read',
  bucketOwnerRead: 'bucket-owner-read' as 'bucket-owner-read',
  bucketOwnerFullControl: 'bucket-owner-full-control' as 'bucket-owner-full-control',
}
export type ACLValues = typeof ACL[keyof typeof ACL]

const log = new Log('s3')

let config: AWS.S3.ClientConfiguration = {
  accessKeyId: ACCESS_KEY,
  secretAccessKey: ACCESS_SECRET,
}

if (STORAGE_URL) {
  config = {
    ...config,
    endpoint: STORAGE_URL,
    s3ForcePathStyle: true,
    signatureVersion: 'v4',
  }
}

export const s3 = new AWS.S3(config)

export function readFile(key: string): Promise<AWS.S3.GetObjectOutput> {
  const params = {
    Bucket: BUCKET_NAME,
    Key: key,
  }
  log.info(`Reading file "${key}"`)
  return utils.promisify<AWS.S3.GetObjectOutput>(s3.getObject.bind(s3))(params)
}

export function copyFile(source: string, target: string, acl: ACLValues) {
  const params: AWS.S3.CopyObjectRequest = {
    Bucket: BUCKET_NAME,
    CopySource: `/${BUCKET_NAME}/${source}`,
    Key: target,
    ACL: acl,
  }
  log.info(`Copying file "${source}" into "${target}"`)
  return utils.promisify<AWS.S3.CopyObjectOutput>(s3.copyObject.bind(s3))(
    params
  )
}

export async function listFiles(
  key: string,
  continuationToken?: string,
  contents: AWS.S3.ObjectList = []
): Promise<AWS.S3.ObjectList> {
  const params: AWS.S3.ListObjectsV2Request = {
    Bucket: BUCKET_NAME,
    Prefix: key,
  }
  if (continuationToken) {
    params.ContinuationToken = continuationToken
  } else {
    log.info(`Listing files "${key}"`)
  }

  const listObjects = utils.promisify<AWS.S3.ListObjectsV2Output>(
    s3.listObjectsV2.bind(s3)
  )
  const data = await listObjects(params)
  contents = contents.concat(data.Contents || [])

  return data.IsTruncated
    ? listFiles(key, data.NextContinuationToken, contents)
    : contents
}

export async function deleteFile(key: string) {
  const params = {
    Bucket: BUCKET_NAME,
    Key: key,
  }
  log.info(`Deleting "${key}"`)
  return utils.promisify<AWS.S3.DeleteObjectOutput>(s3.deleteObject.bind(s3))(
    params
  )
}

export async function deleteFolder(key: string) {
  const objectList = await listFiles(key)
  const promises = []

  log.info(`Deleting folder "${key}"`)

  for (const object of objectList) {
    if (object.Key) {
      promises.push(deleteFile(object.Key))
    }
  }
  await Promise.all(promises)

  return deleteFile(key)
}

export async function checkFile(key: string): Promise<boolean> {
  const params = {
    Bucket: BUCKET_NAME,
    Key: key,
  }
  log.info(`Checking file "${key}"`)

  try {
    await utils.promisify<boolean>(s3.headObject.bind(s3))(params)
    return true
  } catch (error) {
    return false
  }
}

export function uploadFile(
  key: string,
  data: Buffer,
  acl: ACLValues,
  options: Partial<AWS.S3.PutObjectRequest> = {}
) {
  const ContentType = options.ContentType || mimeTypes.lookup(key) || ''

  const params = {
    ...options,
    Bucket: BUCKET_NAME,
    Key: key,
    Body: data,
    ACL: acl,
    ContentType,
  }
  log.info(`Uploading file "${key}"`)

  return utils.promisify<AWS.S3.ManagedUpload.SendData>(s3.upload.bind(s3))(
    params
  )
}

export function getFileUploader(
  options: { acl: ACLValues; mimeTypes?: string[]; maxFileSize?: number },
  callback: (req: Request, file: Express.Multer.File) => string
) {
  const { acl, mimeTypes = [], maxFileSize = MAX_FILE_SIZE } = options

  return multer({
    limits: {
      fileSize: maxFileSize,
    },
    fileFilter: function (_, file, cb) {
      if (mimeTypes.length > 0) {
        cb(null, mimeTypes.includes(file.mimetype))
      } else {
        cb(null, true)
      }
    },
    storage: multerS3({
      s3: s3,
      acl: acl,
      bucket: BUCKET_NAME,
      key: (req, file, next) => {
        try {
          next(null, callback(req as Request, file))
        } catch (error) {
          next(error, '')
        }
      },
    }),
  })
}

export const getBucketURL = (): string =>
  STORAGE_URL
    ? `${STORAGE_URL}/${BUCKET_NAME}`
    : `https://${BUCKET_NAME}.s3.amazonaws.com`
