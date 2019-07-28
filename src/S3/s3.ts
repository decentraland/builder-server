import * as AWS from 'aws-sdk'
import * as multer from 'multer'
import multerS3 from 'multer-s3'
import { env, utils } from 'decentraland-commons'

const accessKeyId = env.get('AWS_ACCESS_KEY', '')
const secretAccessKey = env.get('AWS_ACCESS_SECRET', '')

if (!accessKeyId || !secretAccessKey) {
  throw new Error(
    'You need to add an AWS key and secret to your env file. Check the .env.example file'
  )
}

export let bucketName = env.get('AWS_BUCKET_NAME', '')
if (!bucketName) {
  bucketName = 'builder-server'
  console.warn(
    `Using "${bucketName}" as a bucket name, you can change it in the .env`
  )
}

export const ACL = {
  private: 'private' as 'private',
  publicRead: 'public-read' as 'public-read',
  publicReadWrite: 'public-read-write' as 'public-read-write',
  authenticatedRead: 'authenticated-read' as 'authenticated-read',
  awsExecRead: 'aws-exec-read' as 'aws-exec-read',
  bucketOwnerRead: 'bucket-owner-read' as 'bucket-owner-read',
  bucketOwnerFullControl: 'bucket-owner-full-control' as 'bucket-owner-full-control'
}
export type ACLValues = typeof ACL[keyof typeof ACL]

export const MIME_TYPES = {
  'image/png': 'png',
  'video/webm': 'webm'
}
export type MimeTypes = keyof typeof MIME_TYPES

export const MAX_FILE_SIZE = 5000000

export const s3 = new AWS.S3({ accessKeyId, secretAccessKey })

export function readFile(key: string): Promise<AWS.S3.GetObjectOutput> {
  const params = {
    Bucket: bucketName,
    Key: key
  }
  return utils.promisify<AWS.S3.GetObjectOutput>(s3.getObject.bind(s3))(params)
}

export async function listFiles(
  continuationToken?: string,
  contents: AWS.S3.ObjectList = []
): Promise<AWS.S3.ObjectList> {
  const params: AWS.S3.ListObjectsV2Request = {
    Bucket: bucketName
  }
  if (continuationToken) {
    params.ContinuationToken = continuationToken
  }

  const listObjects = utils.promisify<AWS.S3.ListObjectsV2Output>(
    s3.listObjectsV2.bind(s3)
  )
  const data = await listObjects(params)
  contents = contents.concat(data.Contents || [])

  return data.IsTruncated
    ? listFiles(data.NextContinuationToken, contents)
    : contents
}

export async function checkFile(key: string): Promise<boolean> {
  const params = {
    Bucket: bucketName,
    Key: key
  }
  const headObject = utils.promisify<boolean>(s3.headObject.bind(s3))
  const result = await headObject(params)
  return !!result
}

export function uploadFile(
  key: string,
  data: Buffer,
  acl: ACLValues
): Promise<AWS.S3.ManagedUpload> {
  const params = {
    Bucket: bucketName,
    Key: key,
    Body: data,
    ACL: acl
  }
  return utils.promisify<AWS.S3.ManagedUpload>(s3.upload.bind(s3))(params)
}

export function getFileUploader(
  acl: ACLValues,
  callback: multer.DiskStorageOptions['filename'] // multers3 does not export it's types correctly
) {
  return multer.default({
    limits: {
      fileSize: MAX_FILE_SIZE
    },
    fileFilter: function(_, file, cb) {
      cb(null, Object.keys(MIME_TYPES).includes(file.mimetype))
    },
    storage: multerS3({
      s3: s3,
      acl: acl,
      bucket: bucketName,
      key: callback
    })
  })
}

export function parseFileBody(file: AWS.S3.GetObjectOutput): any | undefined {
  if (file.Body) {
    return JSON.parse(file.Body.toString())
  }
}
