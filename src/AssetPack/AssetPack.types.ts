import { AssetAttributes, assetSchema } from '../Asset'

export type AssetPackAttributes = {
  id: string
  title: string
  url: string
  thumbnail?: string
  user_id: string
  is_deleted: boolean
  assets: AssetAttributes[]
  created_at: Date
  updated_at: Date
}

export const assetPackSchema = Object.freeze({
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    title: { type: 'string' },
    url: { type: 'string' },
    thumbnail: { type: ['string', 'null'] },
    user_id: { type: ['string', 'null'] },
    assets: { items: assetSchema, additionalProperties: false },
    created_at: { type: 'string', nullable: true },
    updated_at: { type: 'string', nullable: true }
  },
  additionalProperties: false,
  removeAdditional: true,
  required: ['id', 'title', 'url', 'assets']
})
