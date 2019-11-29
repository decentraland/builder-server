import { server } from 'decentraland-server'

import { Router } from '../common/Router'
import { withAuthentication, withModelExists, AuthRequest } from '../middleware'
import { RequestParameters } from '../RequestParameters'
import { PoolLike } from './PoolLike.model'
import { Request } from 'express'
import { Pool } from '../Pool'

export class PoolLikeRouter extends Router {
  mount() {
    const withProjectExists = withModelExists(Pool, 'id')

    /**
     * Dislike pool
     */
    this.router.get(
      '/pools/:id/likes',
      withProjectExists,
      server.handleRequest(this.countLikes)
    )

    /**
     * Dislike pool
     */
    this.router.put(
      '/pools/:id/likes',
      withAuthentication,
      withProjectExists,
      server.handleRequest(this.likePool)
    )

    /**
     * Dislike pool
     */
    this.router.delete(
      '/pools/:id/likes',
      withAuthentication,
      withProjectExists,
      server.handleRequest(this.dislikePool)
    )
  }

  async countLikes(req: Request) {
    const parameters = new RequestParameters(req)
    const pool = parameters.getString('id')
    return PoolLike.count({ pool })
  }

  async likePool(req: AuthRequest) {
    const parameters = new RequestParameters(req)
    const pool = parameters.getString('id')
    const user = req.auth.sub

    const exists = await PoolLike.count({ pool, user })

    if (!exists) {
      await PoolLike.create({ pool, user, created_at: new Date() })
      const likes = await PoolLike.count({ pool })
      await Pool.update({ likes }, { id: pool })
    }

    return true
  }

  async dislikePool(req: AuthRequest) {
    const parameters = new RequestParameters(req)
    const pool = parameters.getString('id')
    const user = req.auth.sub

    const exists = await PoolLike.count({ pool, user })

    if (exists) {
      await PoolLike.delete({ pool, user })
      const likes = await PoolLike.count({ pool })
      await Pool.update({ likes }, { id: pool })
    }

    return true
  }
}
