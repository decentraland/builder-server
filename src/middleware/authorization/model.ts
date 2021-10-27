import { Request, Response, NextFunction } from 'express'
import { server } from 'decentraland-server'

import { AuthRequest } from '../authentication'
import { Ownable, OwnableModel } from '../../Ownable'
import { STATUS_CODES } from '../../common/HTTPError'

function defaultOwnershipCheck(
  Model: OwnableModel,
  id: string,
  ethAddress: string
): Promise<boolean> {
  return new Ownable(Model).isOwnedBy(id, ethAddress)
}

export function withModelAuthorization(
  Model: OwnableModel,
  param = 'id',
  checkOwnership = defaultOwnershipCheck
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const id = server.extractFromReq(req, param)
    const ethAddress = (req as AuthRequest).auth.ethAddress

    if (!ethAddress) {
      throw new Error(
        'Unauthenticated request. You need to use the authentication middleware before this one'
      )
    }

    const isOwnedByUser = await checkOwnership(Model, id, ethAddress)
    if (!isOwnedByUser) {
      res
        .status(STATUS_CODES.unauthorized)
        .json(
          server.sendError(
            { ethAddress, tableName: Model.tableName },
            `Unauthorized user ${ethAddress} for ${Model.tableName} ${id}`
          )
        )
      return
    }

    next()
  }
}
