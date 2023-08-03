import { ManifestAttributes } from '../Manifest'
import { S3Project } from './S3Project'

export const MANIFEST_FILENAME = 'manifest.json'

export async function getProjectManifest(
  projectId: string
): Promise<ManifestAttributes> {
  const manifestBody = await new S3Project(projectId).readFileBody(
    MANIFEST_FILENAME
  )
  if (!manifestBody) {
    throw new Error('Could not fetch manifest file')
  }
  return JSON.parse(manifestBody.toString()) as ManifestAttributes
}
