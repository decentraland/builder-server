import { RarityFragment } from '../ethereum/api/fragments'

export enum Currency {
  USD = 'USD',
}

/**
 * When using the RaritiesWithOracle contract:
 * 
 * - "price" is the price in MANA converted from "originalCurrency" of the rarity.
 * - "originalPrice" is the price in "originalCurrency" for the rarity.
 * - "originalCurrency" is the currency from which the price has been converted from.
 * 
 * NOTE: In this version, the only existing currency that is converted to MANA is "USD"
 * 
 * When using the original Rarities contract:
 * 
 * - "price" is the price in MANA for the rarity without any conversion, returned as is from the graph.
 * - "originalPrice" is always undefined.
 * - "originalCurrency" is always undefined.
 */
export type Rarity = RarityFragment & {
  originalPrice?: string
  originalCurrency?: Currency
}
