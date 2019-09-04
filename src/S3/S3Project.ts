import { S3Model } from './S3Model'

// **Keep in mind** that the project files are being stored in the same folder
export class S3Project extends S3Model {
  constructor(id: string) {
    super(id)
    this.type = 'projects'
  }
}
