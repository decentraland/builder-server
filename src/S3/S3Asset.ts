import { S3Model } from './S3Model'
import { S3Type } from './types'

export class S3Asset extends S3Model {
  constructor(id: string = '') {
    super(id, S3Type.ASSET)
  }

  getFolder(): string {
    return this.type
  }
}
