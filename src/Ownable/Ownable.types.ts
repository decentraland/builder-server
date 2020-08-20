import { Project } from '../Project'
import { Pool } from '../Pool'
import { Deployment } from '../Deployment'
import { AssetPack } from '../AssetPack'
import { Item } from '../Item'

export type OwnableModel =
  | typeof Project
  | typeof Pool
  | typeof Deployment
  | typeof AssetPack
  | typeof Item
