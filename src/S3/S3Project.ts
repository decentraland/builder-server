import { readFile, checkFile, deleteFile, uploadFile, ACL } from './s3'

export class S3Project {
  id: string

  constructor(id: string) {
    this.id = id
  }

  async readFile(filename: string) {
    let body

    try {
      const key = this.getFileKey(filename)
      const file = await readFile(key)
      body = file.Body
    } catch (error) {
      // No previous entity
    }
    return body
  }

  async saveFile(filename: string, data: string, encoding?: string) {
    const key = this.getFileKey(filename)
    return uploadFile(key, Buffer.from(data, encoding), ACL.publicRead)
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
