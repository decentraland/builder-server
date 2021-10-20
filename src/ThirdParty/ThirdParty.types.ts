import { ThirdPartyFragment } from '../ethereum/api/fragments'

export type ThirdParty = Omit<ThirdPartyFragment, 'metadata'> & {
  name: string
  description: string
}
