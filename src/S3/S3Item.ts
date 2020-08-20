import { S3Model } from './S3Model'
import { S3Type } from './types'

export class S3Item extends S3Model {
  constructor(id: string) {
    super(id, S3Type.ITEM)
  }

  getThumbnailFilename() {
    return ''
  }

  getFolder(): string {
    return this.type
  }
}
