import { Project } from '../Project'
import { Pool } from '../Pool'
import { Deployment } from '../Deployment'
import { AssetPack } from '../AssetPack'
import { Collection } from '../Collection'
import { Item } from '../Item'

export type OwnableModel =
  | typeof Project
  | typeof Pool
  | typeof Deployment
  | typeof AssetPack
  | typeof Collection
  | typeof Item
