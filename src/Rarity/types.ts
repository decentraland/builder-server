import { RarityFragment } from '../ethereum/api/fragments'

export enum Currency {
  USD = 'USD',
}

export type Rarity = RarityFragment & {
  originalPrice?: string
  originalCurrency?: Currency
}
