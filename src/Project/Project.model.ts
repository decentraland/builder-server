import { Model } from 'decentraland-server'

import { ProjectAttributes } from './Project.types'

export class Project extends Model<ProjectAttributes> {
  static tableName = 'projects'

  static async isOwnedBy(id: string, userId: string) {
    return (await this.count({ id, user_id: userId })) > 0
  }
}
