import { Request, Response, NextFunction } from 'express'
import { server } from 'decentraland-server'

import { AuthRequest } from '../authentication'
import { Ownable, OwnableModel } from '../../Ownable'
import { STATUS_CODES } from '../../common/HTTPError'

export function withModelAuthorization(Model: OwnableModel, param = 'id') {
  return async (req: Request, res: Response, next: NextFunction) => {
    const id = server.extractFromReq(req, param)
    const ethAddress = (req as AuthRequest).auth.ethAddress

    if (!ethAddress) {
      throw new Error(
        'Unauthenticated request. You need to use the authentication middleware before this one'
      )
    }

    const isOwnedByUser = await new Ownable(Model).isOwnedBy(id, ethAddress)
    if (!isOwnedByUser) {
      res.setHeader('Content-Type', 'application/json')
      res.status(STATUS_CODES.unauthorized).json({
        ok: false,
        error: `Unauthorized user ${ethAddress} for ${Model.tableName} ${id}`
      })
      return
    }

    next()
  }
}
