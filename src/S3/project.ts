import express = require('express')

import { getFileKey } from './manifest'
import { getFileUploader, deleteFile, ACLValues } from './s3'

export const MIME_TYPES = {
  'image/png': 'png'
}
export type MimeTypes = keyof typeof MIME_TYPES

export function getProjectFileUploader(
  acl: ACLValues,
  getProjectId: (req: express.Request) => string
) {
  return getFileUploader(
    acl,
    Object.keys(MIME_TYPES),
    (req: express.Request, file, callback) => {
      try {
        const projectId = getProjectId(req)
        const fileExtension = MIME_TYPES[file.mimetype as MimeTypes]
        const filename = `${file.fieldname}.${fileExtension}`

        callback(null, getFileKey(projectId, filename)) // **Important** Share folders with the manifest resource
      } catch (error) {
        callback(error, '')
      }
    }
  )
}

export async function deleteUploads(projectId: string) {
  // Delete the entire folder
  // **Keep in mind** that the manifest is being stored in the same folder by using the same id
  // We might want to avoid this by just deleting specific files using `listFiles`
  const key = getFileKey(projectId, '')
  return deleteFile(key)
}
