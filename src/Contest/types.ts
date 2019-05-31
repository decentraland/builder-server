import { BaseEntry } from '../common/types'

export type BaseContestEntry = BaseEntry & {
  contest: {
    email: string
    ethAddress: string
    [key: string]: any
  }
}

export type User = {
  id: string
}

export type ContestEntry = BaseContestEntry & {
  user: User
}

export type LegacyContestEntry = BaseContestEntry & {
  user?: User
}
