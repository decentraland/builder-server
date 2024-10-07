import { LinkedContract, ThirdPartyFragment } from '../ethereum/api/fragments'

export type ThirdParty = Omit<ThirdPartyFragment, 'metadata'> &
  ThirdPartyMetadata & { published: boolean; isProgrammatic: boolean }

export type ThirdPartyMetadata = {
  name: string
  description: string
  contracts: LinkedContract[]
}

export type UpdateVirtualThirdPartyBody = {
  isProgrammatic: boolean
}
