import { BaseEntry } from '../common/types'

export type User = {
  id: string
  email: string
  ethAddress: string
}

export type ProjectEntry = BaseEntry & {
  version: number
  project: {
    id: string
    title: string
    description: string
    [key: string]: any
  }
  scene: {
    entities: Record<string, any>
    components: Record<string, any>
    [key: string]: any
  }
  user: User
}
