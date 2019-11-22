import { utils } from 'decentraland-commons'
import { ProjectAttributes, projectSchema } from '../Project'
import { AuthorDetailAttributes } from '../AuthorDetail'

export type PoolAttributes = Pick<
  ProjectAttributes,
  Exclude<keyof ProjectAttributes, 'is_public'>
> & {
  groups: number[]
}

export type PoolUpsertBody = {
  group?: number
  author_detail?: AuthorDetailAttributes
}

export const poolSchema = {
  projectSchema,
  properties: {
    ...(utils.omit(projectSchema.properties, ['is_public']) as PoolAttributes),
    groups: {
      type: 'array',
      items: {
        type: 'integer'
      }
    },
    author_detail: {
      type: 'object'
    }
  }
}

export const publicPoolProperties = Object.keys(
  utils.omit(projectSchema.properties, ['is_public'])
).concat(['groups'])

export const searchablePoolProperties = {
  eq: utils.omit(poolSchema.properties, ['groups']) as (keyof PoolAttributes)[],
  includes: ['groups'] as (keyof PoolAttributes)[]
}

export const sortablePoolProperties = {
  sort: {
    by: ['user_id', 'id', 'title', 'created_at'] as (keyof PoolAttributes)[]
  }
}
