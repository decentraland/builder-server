import { utils } from 'decentraland-commons'
import {
  ProjectAttributes,
  projectSchema,
  searchableProjectProperties
} from '../Project'

export type PoolAttributes = ProjectAttributes
export const poolSchema = {
  projectSchema,
  properties: utils.omit(projectSchema.properties, ['is_public'])
}
export const searchablePoolProperties = searchableProjectProperties
