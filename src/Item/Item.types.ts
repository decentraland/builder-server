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
  /**
   * The urn_suffix field holds the item part of the URN in third party items.
   * TODO: what about this? The urn_suffix will remain null until the user sets it.
   * All Decentraland items will contain this column as null.
   */
  urn_suffix: string | null
  name: string
  description: string
  thumbnail: string
  eth_address: string
  collection_id: string | null
  blockchain_item_id: string | null
  price: string | null
  beneficiary?: string | null
  rarity: ItemRarity | null
  type: ItemType
  data: WearableData
  metrics: MetricsAttributes
  contents: Record<string, string>
  created_at: Date
  updated_at: Date
}

export type FullItem = Omit<ItemAttributes, 'urn_suffix'> & {
  /**
   * The urn field will contain a fully generated URN for all published items.
   */
  urn: string | null
  is_published: boolean
  is_approved: boolean
  in_catalyst: boolean
  total_supply: number
  content_hash: string | null
}
