import { Mappings, Rarity } from '@dcl/schemas'
import { ItemCurationAttributes } from '../Curation/ItemCuration'
import { MetricsAttributes } from '../Metrics'
import { Cheque } from '../SlotUsageCheque'
import { SmartWearableData, WearableData } from './wearable/types'
import { EmoteData } from './emote/types'

export enum ItemType {
  WEARABLE = 'wearable',
  EMOTE = 'emote',
}

export type ItemContents = Record<string, string>

export type ItemAttributes<T = ItemType.WEARABLE> = {
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
  video?: string
  eth_address: string
  collection_id: string | null
  blockchain_item_id: string | null
  local_content_hash: string | null
  price: string | null
  beneficiary?: string | null
  rarity: Rarity
  type: ItemType
  data: T extends ItemType.WEARABLE
    ? WearableData | SmartWearableData
    : EmoteData
  metrics: MetricsAttributes
  utility: string | null
  contents: ItemContents
  mappings: Mappings | null
  created_at: Date
  updated_at: Date
}

export type ThirdPartyItemAttributes = ItemAttributes & {
  urn_suffix: string
  collection_id: string
  local_content_hash: string
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
  catalyst_content_hash: string | null
  isMappingComplete?: boolean
}

export type DBItemApprovalData = Pick<ItemAttributes, 'id'> &
  Pick<FullItem, 'content_hash'>

export type ItemApprovalData = {
  cheque: Cheque
  content_hashes: Record<
    ItemAttributes['id'],
    ItemCurationAttributes['content_hash']
  >
  chequeWasConsumed: boolean
  root: string | null
}
