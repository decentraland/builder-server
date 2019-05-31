import { BaseEntry } from '../common/types'

export type User = {
  id: string
  email: string
  ethAddress: string
}

export type ProjectEntry = BaseEntry & {
  user: User
}
