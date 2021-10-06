import { metricsSchema } from '../Metrics/Metrics.types'
import { ItemRarity, ItemType } from './Item.types'
import { wearableSchema } from './wearable/types'

// The schema is placed into this file to avoid a circular dependency.
export const itemSchema = Object.freeze({
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
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
