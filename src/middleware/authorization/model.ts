import { Request, Response, NextFunction } from 'express'
import { server } from 'decentraland-server'

import { AuthRequest } from '../authentication'
import { Ownable, OwnableModel } from '../../Ownable'

export function modelAuthorization(Model: OwnableModel) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const id = server.extractFromReq(req, 'id')
    const user_id = (req as AuthRequest).auth.sub

    if (!user_id) {
      throw new Error(
        'Unauthenticated request. You need to use the authentication middleware before this one'
      )
    }

    const isOwnedByUser = await new Ownable(Model).isOwnedBy(id, user_id)
    if (!isOwnedByUser) {
      res.setHeader('Content-Type', 'application/json')
      res.status(401).json({
        ok: false,
        error: `Unauthorized user ${user_id} for ${Model.tableName} ${id}`
      })
      return
    }

    next()
  }
}
