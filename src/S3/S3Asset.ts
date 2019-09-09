import { S3Model } from './S3Model'

export class S3Asset extends S3Model {
  constructor(id: string = '') {
    super('', 'assets')
    this.id = id
  }

  getFolder(): string {
    return `${this.type}`
  }
}
