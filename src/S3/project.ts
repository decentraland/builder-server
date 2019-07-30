import express = require('express')

import { getFileUploader, deleteFile, ACLValues } from './s3'

export const MIME_TYPES = {
  'image/png': 'png'
}
export type MimeTypes = keyof typeof MIME_TYPES

const PREFIX = 'project'

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

        callback(null, getProjectFileKey(projectId, filename)) // **Important** Share folders with the manifest resource
      } catch (error) {
        callback(error, '')
      }
    }
  )
}

export function deleteProject(id: string) {
  // Delete the entire folder
  // **Keep in mind** that the project manifest is being stored in the same folder
  const key = getProjectFolder(id)
  return deleteFile(key)
}

export function getProjectFileKey(id: string, filename: string): string {
  return `${getProjectFolder(id)}/${filename}`
}

export function getProjectFolder(id: string): string {
  return `${PREFIX}/${id}`
}
