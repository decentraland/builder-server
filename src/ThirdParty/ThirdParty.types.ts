import { LinkedContract, ThirdPartyFragment } from '../ethereum/api/fragments'

export type ThirdParty = Omit<ThirdPartyFragment, 'metadata'> &
  ThirdPartyMetadata & { published: boolean }

export type ThirdPartyMetadata = {
  name: string
  description: string
  contracts: LinkedContract[]
}
