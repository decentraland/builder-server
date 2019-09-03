import { Model } from 'decentraland-server'

import { Ownable } from '../Ownable'
import { ProjectAttributes } from './Project.types'

export class Project extends Model<ProjectAttributes> {
  static tableName = 'projects'

  static async exists(id: string) {
    return (await this.count({ id })) > 0
  }

  static async canUpsert(id: string, userId: string) {
    const [projectExists, isOwner] = await Promise.all([
      Project.exists(id),
      new Ownable(Project).isOwnedBy(id, userId)
    ])
    return !projectExists || isOwner
  }
}
