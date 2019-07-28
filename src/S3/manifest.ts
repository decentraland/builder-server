import { ManifestAttributes } from '../Manifest'

import {
  readFile,
  deleteFile,
  checkFile,
  uploadFile,
  parseFileBody,
  ACL
} from './s3'

const MANIFEST_FILENAME = 'manifest.json'

export const PREFIX = 'manifest'

export async function readManifest(manifestId: string) {
  try {
    const key = getFileKey(manifestId, MANIFEST_FILENAME)
    const file = await readFile(key)
    return parseFileBody(file)
  } catch (error) {
    // No previous entity
  }
}

export async function saveManifest(
  manifestId: string,
  manifest: ManifestAttributes
) {
  const key = getFileKey(manifestId, MANIFEST_FILENAME)
  await uploadFile(key, Buffer.from(JSON.stringify(manifest)), ACL.publicRead)
  await checkFile(key)
}

export async function deleteManifest(manifestId: string) {
  // Delete the entire folder.
  // **Keep in mind** that the project media is being stored in the same folder by using the same id
  // We might want to avoid this by just deleting specific files using `listFiles`
  const key = getFileKey(manifestId, '')
  return deleteFile(key)
}

export function getFileKey(manifestId: string, filename: string): string {
  return `${PREFIX}/${manifestId}/${filename}`
}
