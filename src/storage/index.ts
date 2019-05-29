import * as multer from 'multer'
import * as multerS3 from 'multer-s3'

import {
  bucketName,
  checkFile,
  parseFileBody,
  readFile,
  s3,
  uploadFile
} from '../S3'

export enum EntryPrefix {
  Contest = 'contest',
  Project = 'project'
}

export async function readEntry(projectId: string, prefix: EntryPrefix) {
  try {
    const key = prefix + '/' + projectId
    const file = await readFile(key)
    return parseFileBody(file)
  } catch (error) {
    // No previous entity
  }
}

export async function saveEntry(
  projectId: string,
  entry: any,
  prefix: EntryPrefix
) {
  const key = prefix + '/' + projectId
  await uploadFile(key, Buffer.from(JSON.stringify(entry)))
  await checkFile(key)
}

export function getFileUploader(filename: string, prefix: EntryPrefix) {
  return multer.default({
    storage: multerS3.default({
      s3: s3,
      bucket: bucketName,
      key: function(_req, _file, cb) {
        const key = prefix + '/' + filename
        cb(null, key)
      }
    })
  })
}
