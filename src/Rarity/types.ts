import { RarityFragment } from '../ethereum/api/fragments'

export enum Currency {
  MANA = 'MANA',
  USD = 'USD',
}

export type Rarity = RarityFragment & { currency: Currency }
