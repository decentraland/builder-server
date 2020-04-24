import { Request, Response, NextFunction } from 'express'
import { server } from 'decentraland-server'

import { AuthRequestLegacy } from '../authentication-legacy'
import { OwnableLegacy, OwnableModel } from '../../Ownable'
import { STATUS_CODES } from '../../common/HTTPError'

export function withModelAuthorizationLegacy(
  Model: OwnableModel,
  param = 'id'
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const id = server.extractFromReq(req, param)
    const user_id = (req as AuthRequestLegacy).auth.sub

    if (!user_id) {
      throw new Error(
        'Unauthenticated request. You need to use the authentication-legacy middleware before this one'
      )
    }

    const isOwnedByUser = await new OwnableLegacy(Model).isOwnedBy(id, user_id)
    if (!isOwnedByUser) {
      res.setHeader('Content-Type', 'application/json')
      res.status(STATUS_CODES.unauthorized).json({
        ok: false,
        error: `Unauthorized user ${user_id} for ${Model.tableName} ${id}`
      })
      return
    }

    next()
  }
}
