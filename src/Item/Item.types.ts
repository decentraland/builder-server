import { metricsSchema } from '../Metrics'
import { WearableData, wearableSchema } from './wearable/types'

enum ItemType {
  WEARABLE = 'wearable'
}

enum ItemRarity {
  UNIQUE = 'unique',
  MYTHIC = 'mythic',
  LEGENDARY = 'legendary',
  EPIC = 'epic',
  RARE = 'rare',
  UNCOMMON = 'uncommon',
  COMMON = 'common'
}

export type ItemAttributes = {
  id: string // uuid
  name: string
  description: string
  thumbnail: string
  eth_address: string
  collection_id?: string
  blockchain_item_id?: string
  price?: string
  beneficiary?: string
  rarity?: ItemRarity
  type: ItemType
  data: WearableData
  metrics: Record<string, string>
  contents: Record<string, string>
  created_at: Date
  updated_at: Date
}

export const itemSchema = Object.freeze({
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    description: { type: ['string', 'null'] },
    thumbnail: { type: 'string' },
    eth_address: { type: 'string' },
    collection_id: { type: 'string', format: 'uuid' },
    blockchain_item_id: { type: 'string' },
    price: { type: 'string' },
    beneficiary: { type: ['string', 'null'] },
    rarity: { enum: Object.values(ItemRarity) },
    type: { enum: Object.values(ItemType) },
    data: { type: 'object', oneOf: [wearableSchema] },
    metrics: metricsSchema,
    contents: {
      type: 'object',
      additionalProperties: true
    },
    created_at: { type: 'string' },
    updated_at: { type: 'string' }
  },
  additionalProperties: false,
  removeAdditional: true,
  required: [
    'id',
    'name',
    'description',
    'eth_address',
    'type',
    'data',
    'contents',
    'created_at',
    'updated_at'
  ]
})
