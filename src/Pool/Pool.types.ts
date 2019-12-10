import { utils } from 'decentraland-commons'
import { ProjectAttributes, projectSchema } from '../Project'

export type PoolAttributes = Pick<
  ProjectAttributes,
  Exclude<keyof ProjectAttributes, 'is_public' | 'is_deleted'>
> & {
  groups: string[]
  likes: number
}

export type PoolUpsertBody = {
  groups?: string[]
  likes?: number
}

export const poolSchema = {
  projectSchema,
  properties: {
    ...(utils.omit(projectSchema.properties, [
      'is_public',
      'is_deleted'
    ]) as PoolAttributes),
    groups: {
      type: 'array',
      items: {
        type: 'string',
        format: 'uuid'
      }
    }
  }
}

export const searchablePoolProperties = {
  eq: utils.omit<(keyof PoolAttributes)[]>(poolSchema.properties, [
    'groups',
    'user_id'
  ]),
  includes: ['groups'] as (keyof PoolAttributes)[]
}

export const sortablePoolProperties = {
  sort: {
    by: [
      'user_id',
      'id',
      'title',
      'created_at',
      'updated_at',
      'likes',
      'parcels',
      'transforms',
      'scripts',
      'gltf_shapes',
      'nft_shapes'
    ] as (keyof PoolAttributes)[]
  }
}
