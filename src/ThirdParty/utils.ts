import { utils } from 'decentraland-commons'
import { LinkedContract, ThirdPartyFragment } from '../ethereum/api/fragments'
import { ThirdParty } from './ThirdParty.types'
import { VirtualThirdPartyAttributes } from './VirtualThirdParty.types'

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

export function parseRawMetadata(
  rawMetadata: string
): Pick<ThirdParty, 'name' | 'description' | 'contracts'> {
  const data = rawMetadata.split(':')
  return {
    name: data[2] ?? '',
    description: data[3] ?? '',
    contracts:
      data.length == 5 ? buildThirdPartyLinkedContractsMetadata(data[4]) : [],
  }
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
  dbVirtualThirdParty: VirtualThirdPartyAttributes
): ThirdParty {
  const { name, description, contracts } = parseRawMetadata(
    dbVirtualThirdParty.rawMetadata
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
    root: '',
  }
}
