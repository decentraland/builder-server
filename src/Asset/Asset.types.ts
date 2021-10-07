import { metricsSchema } from '../Metrics/Metrics.schema'
import { parametersSchema, AssetParameter } from './Parameters'
import { actionsSchema } from './Actions'

export type AssetAttributes = {
  id: string
  asset_pack_id: string
  legacy_id: string
  name: string
  model: string
  script: string | null
  thumbnail: string
  tags: string[]
  category: string
  metrics: Record<string, string>
  contents: Record<string, string>
  parameters: AssetParameter[]
}

export const assetSchema = Object.freeze({
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    asset_pack_id: { type: 'string', format: 'uuid' },
    name: { type: 'string', minLength: 3, maxLength: 50 },
    model: { type: 'string' },
    script: { type: ['string', 'null'] },
    thumbnail: { type: ['string', 'null'] },
    tags: { items: { type: 'string' } },
    category: { type: 'string' },
    contents: {
      type: 'object',
      additionalProperties: true,
    },
    metrics: metricsSchema,
    parameters: parametersSchema,
    actions: actionsSchema,
  },
  additionalProperties: false,
  required: [
    'id',
    'asset_pack_id',
    'name',
    'model',
    'tags',
    'category',
    'contents',
  ],
})
