import { utils } from 'decentraland-commons'
import { ProjectAttributes, projectSchema } from '../Project'

export type PoolAttributes = Pick<
  ProjectAttributes,
  Exclude<
    keyof ProjectAttributes,
    'creation_coords' | 'is_public' | 'is_deleted'
  >
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
    ...utils.omit<PoolAttributes>(projectSchema.properties, [
      'creation_coords',
      'is_public',
      'is_deleted',
    ]),
    groups: {
      type: 'array',
      items: {
        type: 'string',
        format: 'uuid',
      },
    },
  },
}

export const searchablePoolProperties = {
  eq: utils.omit<(keyof PoolAttributes)[]>(poolSchema.properties, [
    'groups',
    'eth_address',
  ]),
  includes: ['groups'] as (keyof PoolAttributes)[],
}

export const sortablePoolProperties = {
  sort: {
    by: [
      'eth_address',
      'id',
      'title',
      'created_at',
      'updated_at',
      'likes',
      'parcels',
      'transforms',
      'scripts',
      'gltf_shapes',
      'nft_shapes',
    ] as (keyof PoolAttributes)[],
  },
}
