import { ProjectAttributes } from '../Project'

export type PoolAttributes = Pick<
  ProjectAttributes,
  Exclude<
    keyof ProjectAttributes,
    'creation_coords' | 'is_public' | 'is_deleted'
  >
> & {
  groups: string[]
  likes: number
}
