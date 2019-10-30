import { metricsSchema } from './Metrics'
import { parametersSchema } from './Parameters'
import { actionsSchema } from './Actions'

export type AssetAttributes = {
  id: string
  asset_pack_id: string
  name: string
  model: string
  script: string
  thumbnail: string
  tags: string[]
  category: string
  contents: Record<string, string>
  parameters: AssetParameter[]
}

export type AssetParameter = {
  id: string
  type: AssetParameterType
  label: string
  default?: boolean | string | boolean
  options?: string[]
}

export enum AssetParameterType {
  BOOLEAN = 'boolean',
  STRING = 'string',
  FLOAT = 'float',
  INTEGER = 'integer'
}

export const assetSchema = Object.freeze({
  type: 'object',
  properties: {
    id: { type: 'string' },
    asset_pack_id: { type: 'string', format: 'uuid' },
    name: { type: 'string', minLength: 3, maxLength: 20 },
    model: { type: 'string' },
    script: { type: ['string', 'null'] },
    thumbnail: { type: ['string', 'null'] },
    tags: { items: { type: 'string' } },
    category: { type: 'string' },
    contents: {
      type: 'object',
      additionalProperties: true
    },
    metrics: metricsSchema,
    parameters: parametersSchema,
    actions: actionsSchema
  },
  additionalProperties: false,
  removeAdditional: true,
  required: [
    'id',
    'asset_pack_id',
    'name',
    'model',
    'tags',
    'category',
    'contents'
  ]
})
