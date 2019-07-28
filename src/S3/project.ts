import express = require('express')

import { getFileKey } from './manifest'
import { getFileUploader, ACLValues, MIME_TYPES, MimeTypes } from './s3'

export function getProjectFileUploader(
  acl: ACLValues,
  getProjectId: (req: express.Request) => string
) {
  return getFileUploader(acl, (req: express.Request, file, callback) => {
    try {
      const projectId = getProjectId(req)
      const fileExtension = MIME_TYPES[file.mimetype as MimeTypes]
      const filename = `${file.fieldname}.${fileExtension}`

      callback(null, getFileKey(projectId, filename))
    } catch (error) {
      callback(error, '')
    }
  })
}

