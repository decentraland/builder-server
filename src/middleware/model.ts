import { validate as validateUuid } from 'uuid'
import { Request, Response, NextFunction } from 'express'
import { server } from 'decentraland-server'

import { STATUS_CODES } from '../common/HTTPError'
import { Project } from '../Project'
import { Pool } from '../Pool'
import { Deployment } from '../Deployment'
import { AssetPack } from '../AssetPack'
import { Asset } from '../Asset'
import { Collection } from '../Collection'
import { Item } from '../Item'

export type QueryableModel =
  | typeof Project
  | typeof Pool
  | typeof Deployment
  | typeof AssetPack
  | typeof Asset
  | typeof Collection
  | typeof Item

export function withModelExists(
  Model: QueryableModel,
  param = 'id',
  enforce: { [key: string]: any } = {}
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const id = server.extractFromReq(req, param)

    if (!validateUuid(id)) {
      res
        .status(STATUS_CODES.badRequest)
        .json(server.sendError({ id }, `Invalid uuid ${id}`))
      return
    }

    const count = await Model.count({ id, ...enforce })
    if (count <= 0) {
      res
        .status(STATUS_CODES.notFound)
        .json(
          server.sendError(
            { id, tableName: Model.tableName },
            `Couldn't find "${id}" on ${Model.tableName}`
          )
        )
      return
    }

    next()
  }
}
