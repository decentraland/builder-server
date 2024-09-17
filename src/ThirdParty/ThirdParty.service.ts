import { thirdPartyAPI } from '../ethereum/api/thirdParty'
import { ItemCuration } from '../Curation/ItemCuration'
import { ThirdParty, ThirdPartyMetadata } from './ThirdParty.types'
import {
  convertThirdPartyMetadataToRawMetadata,
  convertVirtualThirdPartyToThirdParty,
  toThirdParty,
} from './utils'
import {
  NonExistentThirdPartyError,
  OnlyDeletableIfOnGraphError,
  UnauthorizedThirdPartyManagerError,
} from './ThirdParty.errors'
import { VirtualThirdParty } from './VirtualThirdParty.model'
import { VirtualThirdPartyAttributes } from './VirtualThirdParty.types'

export class ThirdPartyService {
  // Virtual Third Party methods
  static async createVirtualThirdParty(
    id: string,
    managers: string[],
    metadata: ThirdPartyMetadata
  ): Promise<ThirdParty> {
    const rawMetadata = convertThirdPartyMetadataToRawMetadata(
      metadata.name,
      metadata.description,
      metadata.contracts
    )
    await VirtualThirdParty.create({ id, managers, rawMetadata })
    return convertVirtualThirdPartyToThirdParty({
      id,
      managers,
      raw_metadata: rawMetadata,
    })
  }

  private static async getVirtualThirdParty(
    thirdPartyId: string
  ): Promise<ThirdParty | undefined> {
    const dbVirtualThirdParty = await VirtualThirdParty.findOne<VirtualThirdPartyAttributes>(
      { id: thirdPartyId }
    )

    return dbVirtualThirdParty
      ? convertVirtualThirdPartyToThirdParty(dbVirtualThirdParty)
      : undefined
  }

  private static async getVirtualThirdPartiesByManager(
    address: string
  ): Promise<ThirdParty[]> {
    const dbVirtualThirdParty = await VirtualThirdParty.findByManager(address)
    return dbVirtualThirdParty.map(convertVirtualThirdPartyToThirdParty)
  }

  // Graph Third Parties methods

  static async getThirdPartyAvailableSlots(
    thirdPartyId: ThirdParty['id']
  ): Promise<number> {
    const [maxItems, itemCurationsCount] = await Promise.all([
      thirdPartyAPI.fetchMaxItemsByThirdParty(thirdPartyId),
      ItemCuration.countByThirdPartyId(thirdPartyId),
    ])
    return maxItems - itemCurationsCount
  }

  // All third parties methods

  static async getThirdParties(manager?: string): Promise<ThirdParty[]> {
    const [fragments, virtualThirdParties] = await Promise.all([
      thirdPartyAPI.fetchThirdPartiesByManager(manager),
      manager
        ? this.getVirtualThirdPartiesByManager(manager)
        : ([] as ThirdParty[]),
    ])
    const graphThirdParties = fragments.map(toThirdParty)
    console.log({ graphThirdParties, virtualThirdParties })
    const virtualThirdPartiesNotInTheGraph = virtualThirdParties.filter(
      (virtualThirdParty) =>
        !graphThirdParties.some(
          (graphThirdParty) => graphThirdParty.id === virtualThirdParty.id
        )
    )
    return graphThirdParties.concat(virtualThirdPartiesNotInTheGraph)
  }

  static async fetchReceiptById(hash: string) {
    return thirdPartyAPI.fetchReceiptById(hash)
  }

  static async getThirdParty(
    thirdPartyId: ThirdParty['id']
  ): Promise<ThirdParty> {
    const thirdParty = await thirdPartyAPI.fetchThirdParty(thirdPartyId)

    if (thirdParty) {
      return toThirdParty(thirdParty)
    }

    const virtualThirdParty = await this.getVirtualThirdParty(thirdPartyId)
    if (virtualThirdParty) {
      return virtualThirdParty
    }

    throw new NonExistentThirdPartyError(thirdPartyId)
  }

  static async isManager(
    thirdPartyId: string,
    address: string
  ): Promise<boolean> {
    const thirdPartyFragment = await thirdPartyAPI.fetchThirdParty(thirdPartyId)
    if (thirdPartyFragment) {
      return thirdPartyFragment.managers.includes(address)
    }
    const virtualThirdParty = await this.getVirtualThirdParty(thirdPartyId)
    return !!virtualThirdParty?.managers.includes(address)
  }

  static async removeVirtualThirdParty(thirdPartyId: string, manager: string) {
    const virtualThirdParty = await VirtualThirdParty.findOne<VirtualThirdPartyAttributes>(
      { id: thirdPartyId }
    )
    if (!virtualThirdParty) {
      throw new NonExistentThirdPartyError(thirdPartyId)
    }
    if (!virtualThirdParty.managers.includes(manager)) {
      throw new UnauthorizedThirdPartyManagerError(thirdPartyId)
    }
    const graphThirdParty = await thirdPartyAPI.fetchThirdParty(thirdPartyId)
    if (graphThirdParty) {
      await VirtualThirdParty.delete({ id: thirdPartyId })
    } else {
      throw new OnlyDeletableIfOnGraphError(thirdPartyId)
    }
  }
}
