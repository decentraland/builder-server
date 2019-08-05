import { Model } from 'decentraland-server'

import { DeploymentAttributes } from './Deployment.types'

export class Deployment extends Model<DeploymentAttributes> {
  static tableName = 'deployments'

  static async isOwnedBy(id: string, userId: string) {
    return (await this.count({ id, user_id: userId })) > 0
  }
}
