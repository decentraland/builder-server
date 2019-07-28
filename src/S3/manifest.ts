import { ManifestAttributes } from '../Manifest'

import { checkFile, parseFileBody, readFile, uploadFile, ACL } from './s3'

const MANIFEST_FILENAME = 'manifest.json'

export const PREFIX = 'manifest'

export async function readManifest(projectId: string) {
  try {
    const key = getFileKey(projectId, MANIFEST_FILENAME)
    const file = await readFile(key)
    return parseFileBody(file)
  } catch (error) {
    // No previous entity
  }
}

export async function saveManifest(
  projectId: string,
  manifest: ManifestAttributes
) {
  const key = getFileKey(projectId, MANIFEST_FILENAME)
  await uploadFile(key, Buffer.from(JSON.stringify(manifest)), ACL.publicRead)
  await checkFile(key)
}

export function getFileKey(projectId: string, filename: string): string {
  return `${PREFIX}/${projectId}/${filename}`
}
