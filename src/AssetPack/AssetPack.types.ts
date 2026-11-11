import { AssetAttributes } from '../Asset'

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

export const MAX_ASSET_PACKS_COUNT = 10
