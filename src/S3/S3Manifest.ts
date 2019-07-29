import { ManifestAttributes } from '../Manifest'
import { S3Project } from './S3Project'
import { saveManifest, deleteManifest } from './manifest'

export class S3Manifest {
  id: string
  attributes: ManifestAttributes

  constructor(id: string, attributes: ManifestAttributes) {
    this.id = id
    this.attributes = attributes
  }

  upsert() {
    return Promise.all([
      new S3Project(this.attributes.project).upsert(),
      saveManifest(this.id, this.attributes)
    ])
  }

  delete() {
    const projectId = this.attributes.project.id
    return Promise.all([deleteManifest(this.id), S3Project.delete(projectId)])
  }
}
