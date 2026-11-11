import { AssetParameter } from './Parameters'

export type AssetAttributes = {
  id: string
  asset_pack_id: string
  legacy_id: string
  name: string
  model: string
  script: string | null
  thumbnail: string
  tags: string[]
  category: string
  metrics: Record<string, string>
  contents: Record<string, string>
  parameters: AssetParameter[]
}

export const MAX_ASSETS_COUNT = 80
