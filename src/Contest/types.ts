export type Entry = {
  version: number
  project: {
    id: string
    title: string
    description: string
    [key: string]: any
  }
  contest: {
    email: string
    ethAddress: string
    [key: string]: any
  }
  scene: {
    entities: Record<string, any>
    components: Record<string, any>
    [key: string]: any
  }
  secret?: string
}
