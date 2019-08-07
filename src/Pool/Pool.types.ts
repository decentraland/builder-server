import {
  ProjectAttributes,
  projectSchema,
  searchableProjectProperties
} from '../Project'

export type PoolAttributes = ProjectAttributes
export const poolSchema = { ...projectSchema }
export const searchablePoolProperties = [...searchableProjectProperties]
