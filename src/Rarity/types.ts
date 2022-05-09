import { RarityFragment } from '../ethereum/api/fragments'

export enum Currency {
  MANA = 'MANA',
  USD = 'USD',
}

/**
 * Type returned by the Rarity router.
 * The "prices" field is only defined when using the RaritiesWithOracle contract.
 * The "prices" field contains the different prices of a rarity in different currencies.
 */
export type Rarity = RarityFragment & {
  prices?: Record<Currency, string>
}
