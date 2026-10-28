import { Project } from '../Project'
import { Pool } from '../Pool'
import { Deployment } from '../Deployment'
import { Collection } from '../Collection'
import { Item } from '../Item'

export type OwnableModel =
  | typeof Project
  | typeof Pool
  | typeof Deployment
  | typeof Collection
  | typeof Item
