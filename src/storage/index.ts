import express = require('express')
import { server } from 'decentraland-server'

import * as multer from 'multer'
import * as multerS3 from 'multer-s3'

import { BaseEntry } from '../common/types'

import {
  bucketName,
  checkFile,
  parseFileBody,
  readFile,
  s3,
  uploadFile
} from '../S3'

const ENTRY_FILENAME = 'entry.json'
const MAX_FILE_SIZE = 5000000

export enum EntryPrefix {
  Project = 'project'
}

interface ContentTypeExtension {
  [key: string]: string
}

const contentTypeExtensionMap: ContentTypeExtension = {
  'image/png': 'png',
  'video/webm': 'webm'
}

export function getEntryKey(
  filename: string,
  projectId: string,
  prefix: EntryPrefix
): string {
  return `${prefix}/${projectId}/${filename}`
}

export async function readEntry(projectId: string, prefix: EntryPrefix) {
  try {
    const key = getEntryKey(ENTRY_FILENAME, projectId, prefix)
    const file = await readFile(key)
    return parseFileBody(file)
  } catch (error) {
    // No previous entity
  }
}

export async function saveEntry(
  projectId: string,
  entry: BaseEntry,
  prefix: EntryPrefix
) {
  const key = getEntryKey(ENTRY_FILENAME, projectId, prefix)
  await uploadFile(key, Buffer.from(JSON.stringify(entry)))
  await checkFile(key)
}

export function getFileUploader(prefix: EntryPrefix, acl: string = 'private') {
  return multer.default({
    limits: {
      fileSize: MAX_FILE_SIZE
    },
    fileFilter: function(_, file, cb) {
      cb(null, Object.keys(contentTypeExtensionMap).includes(file.mimetype))
    },
    storage: multerS3.default({
      s3: s3,
      acl: acl,
      bucket: bucketName,
      key: function(req: express.Request, file, cb) {
        const projectId = server.extractFromReq(req, 'projectId')
        const fileExtension = contentTypeExtensionMap[file.mimetype]
        const filename = `${file.fieldname}.${fileExtension}`
        const key = getEntryKey(filename, projectId, prefix)

        cb(null, key)
      }
    })
  })
}
