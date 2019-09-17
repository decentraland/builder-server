export type AssetAttributes = {
  id: string
  asset_pack_id: string
  name: string
  url: string
  thumbnail: string
  tags: string[]
  category: string
  contents: Record<string, string>
}

export const assetSchema = Object.freeze({
  type: 'object',
  properties: {
    id: { type: 'string' },
    asset_pack_id: { type: 'string', format: 'uuid' },
    name: { type: 'string', minLength: 3, maxLength: 20 },
    url: { type: 'string' },
    thumbnail: { type: ['string', 'null'] },
    tags: { items: { type: 'string' } },
    category: { type: 'string' },
    contents: {
      type: 'object',
      additionalProperties: true
    }
  },
  additionalProperties: false,
  removeAdditional: true,
  required: [
    'id',
    'asset_pack_id',
    'name',
    'url',
    'tags',
    'category',
    'contents'
  ]
})
