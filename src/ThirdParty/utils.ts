import { utils } from 'decentraland-commons'
import { LinkedContract, ThirdPartyFragment } from '../ethereum/api/fragments'
import { ThirdParty } from './ThirdParty.types'
import { VirtualThirdPartyAttributes } from './VirtualThirdParty.types'

export function hasManager(managers: string[], address?: string): boolean {
  if (!address) {
    return false
  }
  const normalized = address.toLowerCase()
  return managers.some((manager) => manager.toLowerCase() === normalized)
}

export function toThirdParty(fragment: ThirdPartyFragment): ThirdParty {
  const { thirdParty } = fragment.metadata

  return {
    ...utils.omit(fragment, ['metadata']),
    name: thirdParty?.name || '',
    description: thirdParty?.description || '',
    contracts: thirdParty?.contracts || [],
    published: true,
  }
}

export function isSameContract(a: LinkedContract, b: LinkedContract): boolean {
  return (
    a.network === b.network &&
    a.address.toLowerCase() === b.address.toLowerCase()
  )
}

export function parseRawMetadata(
  rawMetadata: string
): Pick<ThirdParty, 'name' | 'description' | 'contracts'> {
  // Contracts are always the last segment and never contain ':', so a ':' inside the description still round-trips.
  const [, , name = '', ...rest] = rawMetadata.split(':')
  const contracts =
    rest.length >= 2 ? buildThirdPartyLinkedContractsMetadata(rest.pop()!) : []
  return { name, description: rest.join(':'), contracts }
}

function buildThirdPartyLinkedContractsMetadata(
  contractsMetadata: string
): LinkedContract[] {
  const contracts = contractsMetadata.split(';')
  return contracts
    .filter((contract) => contract.split('-').length === 2)
    .map((contract) => {
      const contractData = contract.split('-')
      return { network: contractData[0], address: contractData[1] }
    })
}

export function convertThirdPartyMetadataToRawMetadata(
  name: string,
  description: string,
  contracts: LinkedContract[]
): string {
  const rawContracts = contracts
    .map((contract) => `${contract.network}-${contract.address}`)
    .join(';')
  return `tp:1:${name}:${description}${rawContracts ? `:${rawContracts}` : ''}`
}

export function convertVirtualThirdPartyToThirdParty(
  dbVirtualThirdParty: Omit<
    VirtualThirdPartyAttributes,
    'created_at' | 'updated_at'
  >
): ThirdParty {
  const { name, description, contracts } = parseRawMetadata(
    dbVirtualThirdParty.raw_metadata
  )

  return {
    id: dbVirtualThirdParty.id,
    managers: dbVirtualThirdParty.managers,
    name,
    description,
    contracts,
    maxItems: '0',
    isApproved: false,
    published: false,
    isProgrammatic: dbVirtualThirdParty.isProgrammatic,
    root: '',
  }
}
