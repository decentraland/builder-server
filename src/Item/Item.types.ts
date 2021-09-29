import { MetricsAttributes } from '../Metrics'
import { WearableData } from './wearable/types'

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
