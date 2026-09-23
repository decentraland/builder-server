import { Project } from '../Project'
import { Deployment } from '../Deployment'
import { Collection } from '../Collection'
import { Item } from '../Item'

export type OwnableModel =
  | typeof Project
  | typeof Deployment
  | typeof Collection
  | typeof Item
