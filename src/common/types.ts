import { ProjectAttributes } from '../Project'

export type BaseEntry = {
  version: number
  project: ProjectAttributes
  scene: {
    entities: Record<string, any>
    components: Record<string, any>
    [key: string]: any
  }
}
