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

export function readFile(key: string): Promise<any> {
  const params = {
    Bucket: bucketName,
    Key: key
  }
  return utils.promisify<any>(s3.getObject.bind(s3))(params)
}

export function checkFile(key: string): Promise<boolean> {
  const params = {
    Bucket: bucketName,
    Key: key
  }
  return utils.promisify<boolean>(s3.headObject.bind(s3))(params)
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
