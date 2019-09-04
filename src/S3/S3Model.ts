import {
  readFile,
  checkFile,
  deleteFile,
  deleteFolder,
  uploadFile,
  ACL
} from './s3'

export class S3Model {
  id: string
  type: string = ''

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
    return deleteFolder(this.getFolder())
  }

  getFileKey(filename: string): string {
    return `${this.getFolder()}/${filename}`
  }

  private getFolder(): string {
    return `${this.type}/${this.id}`
  }
}
