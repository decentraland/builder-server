import { Project, ProjectAttributes } from '../Project'
import { deleteUploads } from './project'

export class S3Project {
  attributes: ProjectAttributes

  static delete(id: string) {
    const attributes = { id } as ProjectAttributes
    return new S3Project(attributes).delete()
  }

  constructor(attributes: ProjectAttributes) {
    this.attributes = attributes
  }

  upsert() {
    return new Project(this.attributes).upsert()
  }

  delete() {
    const id = this.attributes.id
    return Promise.all([deleteUploads(id), Project.delete({ id })])
  }
}
