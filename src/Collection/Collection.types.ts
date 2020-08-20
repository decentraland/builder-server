export type CollectionAttributes = {
  id: string // uuid
  name: string
  eth_address: string
  hash?: string
  contract_address?: string
  isPublished: boolean
  created_at: Date
  updated_at: Date
}

export const collectionSchema = Object.freeze({
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    eth_address: { type: 'string' },
    created_at: { type: ['string', 'null'] },
    updated_at: { type: ['string', 'null'] }
  },
  additionalProperties: false,
  removeAdditional: true,
  required: ['id', 'name', 'eth_address', 'created_at', 'updated_at']
})
