import { S3Model } from './S3Model'
import { S3Type } from './types'

export class S3Content extends S3Model {
  constructor() {
    super('', S3Type.CONTENT)
  }

  getFolder(): string {
    return this.type
  }
}
