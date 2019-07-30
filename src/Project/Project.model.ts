import { Model } from 'decentraland-server'

import { ProjectAttributes } from './Project.types'

export class Project extends Model<ProjectAttributes> {
  static tableName = 'projects'

  static async isOwnedBy(projectId: string, userId: string) {
    return (await this.count({ id: projectId, user_id: userId })) > 0
  }
}
