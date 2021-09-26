import { MetricsAttributes, metricsSchema } from '../Metrics'
import { WearableData, wearableSchema } from './wearable/types'

export enum ItemType {
  WEARABLE = 'wearable',
}

export enum ItemRarity {
  UNIQUE = 'unique',
  MYTHIC = 'mythic',
  LEGENDARY = 'legendary',
  EPIC = 'epic',
  RARE = 'rare',
  UNCOMMON = 'uncommon',
  COMMON = 'common',
}

export type ItemAttributes = {
  id: string // uuid
  urn: string | null
  name: string
  description: string
  thumbnail: string
  eth_address: string
  collection_id: string | null
  blockchain_item_id: string | null
  price: string | null
  beneficiary?: string | null
  rarity: ItemRarity | null
  total_supply: number
  is_published: boolean
  is_approved: boolean
  in_catalyst: boolean
  type: ItemType
  data: WearableData
  metrics: MetricsAttributes
  contents: Record<string, string>
  created_at: Date
  updated_at: Date
}

export const itemSchema = Object.freeze({
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    urn: { type: 'string' },
    name: { type: 'string', maxLength: 32 },
    description: { type: ['string', 'null'], maxLength: 64 },
    thumbnail: { type: 'string' },
    eth_address: { type: 'string' },
    collection_id: { type: ['string', 'null'], format: 'uuid' },
    blockchain_item_id: { type: ['string', 'null'] },
    price: { type: ['string', 'null'] },
    beneficiary: { type: ['string', 'null'] },
    rarity: {
      type: ['string', 'null'],
      enum: [...Object.values(ItemRarity), null],
    },
    total_supply: { type: 'number', minimum: 0 },
    is_published: { type: 'boolean' },
    is_approved: { type: 'boolean' },
    type: { enum: Object.values(ItemType) },
    data: { type: 'object', oneOf: [wearableSchema] },
    metrics: metricsSchema,
    contents: {
      type: 'object',
      additionalProperties: true,
    },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
  },
  additionalProperties: false,
  required: [
    'id',
    'name',
    'description',
    'eth_address',
    'data',
    'type',
    'metrics',
    'contents',
    'created_at',
    'updated_at',
  ],
})
