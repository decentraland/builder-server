import { Request, Response, NextFunction } from 'express'
import { server } from 'decentraland-server'

import { Project } from '../Project'
import { Pool } from '../Pool'
import { Deployment } from '../Deployment'
import { AssetPack } from '../AssetPack'
import { Asset } from '../Asset'

export type QueryableModel =
  | typeof Project
  | typeof Pool
  | typeof Deployment
  | typeof AssetPack
  | typeof Asset

export function modelExists(Model: QueryableModel, param = 'id') {
  return async (req: Request, res: Response, next: NextFunction) => {
    const id = server.extractFromReq(req, param)

    const count = await Model.count({ id })
    if (count <= 0) {
      res.setHeader('Content-Type', 'application/json')
      res.status(404).json({
        ok: false,
        error: `Couldn't find "${id}" on ${Model.tableName}`
      })
      return
    }

    next()
  }
}
