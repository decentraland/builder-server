import { AssetParameter } from '../Parameters'

export type AssetAction = {
  id: string
  label: string
  parameters: AssetParameter[]
}

export type ActionAttributes = AssetAction[]
