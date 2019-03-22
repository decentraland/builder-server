import * as AWS from 'aws-sdk'
import { env, utils } from 'decentraland-commons'

const accessKeyId = env.get('AWS_ACCESS_KEY', '')
const secretAccessKey = env.get('AWS_ACCESS_SECRET', '')

if (!accessKeyId || !secretAccessKey) {
  throw new Error(
    'You need to add an AWS key and secret to your env file. Check the .env.example file'
  )
}

let bucketName = env.get('AWS_BUCKET_NAME', '')
if (!bucketName) {
  bucketName = 'builder-contest-server'
  console.warn(
    `Using "${bucketName}" as a bucket name, you can change it in the .env`
  )
}

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
  data: Buffer
): Promise<AWS.S3.ManagedUpload> {
  const params = {
    Bucket: bucketName,
    Key: key,
    Body: data,
    ACL: 'public-read'
  }
  return utils.promisify<AWS.S3.ManagedUpload>(s3.upload.bind(s3))(params)
}

export function parseFileBody(file: AWS.S3.GetObjectOutput): any | undefined {
  if (file.Body) {
    return JSON.parse(file.Body.toString())
  }
}
