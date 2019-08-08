import { ManifestAttributes } from '../Manifest'

import {
  readFile,
  checkFile,
  deleteFile,
  uploadFile,
  parseFileBody,
  ACL
} from './s3'

export class S3Project {
  id: string

  constructor(id: string) {
    this.id = id
  }

  async readFile(filename: string) {
    try {
      const key = this.getFileKey(filename)
      const file = await readFile(key)
      return parseFileBody(file)
    } catch (error) {
      // No previous entity
    }
  }

  async saveManifest(filename: string, manifest: ManifestAttributes) {
    return this.saveFile(filename, manifest)
  }

  async saveFile(filename: string, data: any) {
    const key = this.getFileKey(filename)
    return uploadFile(key, Buffer.from(JSON.stringify(data)), ACL.publicRead)
  }

  async deleteFile(filename: string) {
    const key = this.getFileKey(filename)

    if (!(await checkFile(key))) {
      throw new Error(`File "${key}" does not exist`)
    }
    return deleteFile(key)
  }

  async delete() {
    // Delete the entire folder
    // **Keep in mind** that the project files are being stored in the same folder
    return deleteFile(this.getProjectFolder())
  }

  getFileKey(filename: string): string {
    return `${this.getProjectFolder()}/${filename}`
  }

  private getProjectFolder(): string {
    return `project/${this.id}`
  }
}
