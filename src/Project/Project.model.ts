import { Model } from 'decentraland-server'

import { ProjectAttributes } from './Project.types'

export class Project extends Model<ProjectAttributes> {
  static tableName = 'projects'
}
