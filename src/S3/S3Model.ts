import {
  readFile,
  checkFile,
  deleteFile,
  deleteFolder,
  uploadFile,
  ACLValues
} from './s3'

export class S3Model {
  id: string
  type: string

  constructor(id: string, type: string) {
    this.id = id
    this.type = type
  }

  async readFileBody(filename: string) {
    const file = await this.readFile(filename)
    let body

    if (file) {
      body = file.Body
    }
    return body
  }

  async readFile(filename: string) {
    let file
    try {
      const key = this.getFileKey(filename)
      file = await readFile(key)
    } catch (error) {
      // No previous entity
    }
    return file
  }

  async saveFile(filename: string, data: string | Buffer, acl: ACLValues) {
    const key = this.getFileKey(filename)
    const buffer = typeof data === 'string' ? Buffer.from(data) : data
    return uploadFile(key, buffer, acl)
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

  protected getFolder(): string {
    return `${this.type}/${this.id}`
  }
}
