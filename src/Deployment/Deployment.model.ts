import { Model } from 'decentraland-server'

import { DeploymentAttributes } from './Deployment.types'

export class Deployment extends Model<DeploymentAttributes> {
  static tableName = 'deployments'
}
