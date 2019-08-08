import { Model } from 'decentraland-server'

import { ProjectAttributes } from './Project.types'

export class Project extends Model<ProjectAttributes> {
  static tableName = 'projects'

  static async exists(id: string) {
    return (await this.count({ id })) > 0
  }

  static async isOwnedBy(id: string, userId: string) {
    return (await this.count({ id, user_id: userId })) > 0
  }

  static async canUpsert(id: string, userId: string) {
    const [projectExists, isOwner] = await Promise.all([
      Project.exists(id),
      Project.isOwnedBy(id, userId)
    ])
    return !projectExists || isOwner
  }
}
