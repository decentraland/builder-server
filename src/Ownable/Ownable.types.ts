import { Project } from '../Project'
import { Pool } from '../Pool'
import { Deployment } from '../Deployment'
import { AssetPack } from '../AssetPack'

export type OwnableModel =
  | typeof Project
  | typeof Pool
  | typeof Deployment
  | typeof AssetPack
