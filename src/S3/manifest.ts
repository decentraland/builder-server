import { ManifestAttributes } from '../Manifest'

import {
  readFile,
  deleteFile,
  checkFile,
  uploadFile,
  parseFileBody,
  ACL
} from './s3'
import { getProjectFolder } from './project'

const MANIFEST_FILENAME = 'manifest.json'

export async function readManifest(id: string) {
  try {
    const key = getManifestFileKey(id)
    const file = await readFile(key)
    return parseFileBody(file)
  } catch (error) {
    // No previous entity
  }
}

export async function saveManifest(id: string, manifest: ManifestAttributes) {
  const key = getManifestFileKey(id)
  await uploadFile(key, Buffer.from(JSON.stringify(manifest)), ACL.publicRead)
  await checkFile(key)
}

export async function deleteManifest(id: string) {
  const key = getManifestFileKey(id)
  return deleteFile(key)
}

export function getManifestFileKey(id: string): string {
  return `${getProjectFolder(id)}/${MANIFEST_FILENAME}`
}
