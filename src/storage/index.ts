import express = require('express')
import { server } from 'decentraland-server'

import * as multer from 'multer'
import * as multerS3 from 'multer-s3'

import { ContestEntry } from '../Contest/types'
import { ProjectEntry } from '../Project/types'

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
  Contest = 'contest',
  Project = 'project'
}

interface ContentTypeExtension {
  [key: string]: string
}

const contentTypeExtensionMap: ContentTypeExtension = {
  'image/png': 'png',
  'video/webm': 'webm'
}

export function getEntryKey(projectId: string, prefix: EntryPrefix): string {
  return prefix + '/' + projectId + '/' + ENTRY_FILENAME
}

export async function readEntry(projectId: string, prefix: EntryPrefix) {
  try {
    const key = getEntryKey(projectId, prefix)
    const file = await readFile(key)
    return parseFileBody(file)
  } catch (error) {
    // No previous entity
  }
}

export async function saveEntry(
  projectId: string,
  entry: ContestEntry | ProjectEntry,
  prefix: EntryPrefix
) {
  const key = getEntryKey(projectId, prefix)
  await uploadFile(key, Buffer.from(JSON.stringify(entry)))
  await checkFile(key)
}

export function getFileUploader(prefix: EntryPrefix, acl: string = 'private') {
  return multer.default({
    limits: {
      fileSize: MAX_FILE_SIZE
    },
    storage: multerS3.default({
      s3: s3,
      acl: acl,
      bucket: bucketName,
      key: function(req: express.Request, file, cb) {
        const fileExtension = contentTypeExtensionMap[file.mimetype]
        if (!fileExtension) {
          cb(new Error(`Content-Type not supported : ${file.mimetype}`))
          return
        }

        const projectId = server.extractFromReq(req, 'projectId')
        const key = `${prefix}/${projectId}/${file.fieldname}.${fileExtension}`
        cb(null, key)
      }
    })
  })
}
