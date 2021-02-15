import { AssetAttributes, assetSchema } from '../Asset'

export type FullAssetPackAttributes = {
  id: string
  title: string
  thumbnail?: string
  eth_address: string | null
  is_deleted: boolean
  assets: AssetAttributes[]
  created_at: Date
  updated_at: Date
}
export type AssetPackAttributes = Omit<FullAssetPackAttributes, 'assets'>

export const assetPackSchema = Object.freeze({
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    title: { type: 'string', minLength: 3, maxLength: 20 },
    thumbnail: { type: ['string', 'null'] },
    eth_address: { type: ['string', 'null'] },
    assets: { items: assetSchema, additionalProperties: false },
    created_at: { type: ['string', 'null'] },
    updated_at: { type: ['string', 'null'] },
  },
  additionalProperties: false,
  required: ['id', 'title', 'assets'],
})
