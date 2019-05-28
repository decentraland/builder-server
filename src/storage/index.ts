import { readFile, parseFileBody } from '../S3'

export async function readEntry(projectId: string) {
  try {
    const file = await readFile(projectId)
    return parseFileBody(file)
  } catch (error) {
    // No previous entity
  }
}
