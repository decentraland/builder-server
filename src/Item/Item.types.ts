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
  eth_address: string
  collection_id?: string
  blockchain_item_id?: string
  price?: string
  beneficiary?: string
  rarity?: ItemRarity
  type: ItemType
  data: WearableData
  created_at: Date
  updated_at: Date
}

export const itemSchema = Object.freeze({
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    description: { type: ['string', 'null'] },
    eth_address: { type: 'string' },
    collection_id: { type: 'string', format: 'uuid' },
    blockchain_item_id: { type: ['string', 'null'] },
    price: { type: 'string' },
    beneficiary: { type: ['string', 'null'] },
    rarity: { enum: Object.values(ItemRarity) },
    type: { enum: Object.values(ItemType) },
    data: { type: 'object', oneOf: [wearableSchema] },
    created_at: { type: ['string', 'null'] },
    updated_at: { type: ['string', 'null'] }
  },
  additionalProperties: false,
  removeAdditional: true,
  required: [
    'id',
    'name',
    'description',
    'eth_address',
    'collection_id',
    'blockchain_item_id',
    'price',
    'beneficiary',
    'rarity',
    'type',
    'data',
    'created_at',
    'updated_at'
  ]
})
