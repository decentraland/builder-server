import { server } from 'decentraland-server'

import { Router } from '../common/Router'
import { withAuthentication, withModelExists, AuthRequest } from '../middleware'
import { RequestParameters } from '../RequestParameters'
import { PoolLike } from './PoolLike.model'
import { Pool } from '../Pool'
import { PoolLikeCount } from './PoolLike.types'

export class PoolLikeRouter extends Router {
  mount() {
    const withProjectExists = withModelExists(Pool, 'id')

    /**
     * Returns the total likes of a pool
     */
    this.router.get(
      '/pools/:id/likes',
      withProjectExists,
      server.handleRequest(this.countLikes)
    )

    /**
     * Like pool
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

  async countLikes(req: AuthRequest) {
    const parameters = new RequestParameters(req)
    const pool_id = parameters.getString('id')
    const currentUserId = (req.auth && req.auth.sub) || null

    const filters: PoolLikeCount = { pool_id }
    if (parameters.has('userId')) {
      const userId = parameters.getString('userId')
      if (userId === 'me' || userId === currentUserId) {
        filters.user_id = req.auth.sub
      } else {
        // TODO: allow to filter by any users
        return 0
      }
    }

    return PoolLike.count(filters)
  }

  async likePool(req: AuthRequest) {
    const parameters = new RequestParameters(req)
    const pool_id = parameters.getString('id')
    const user_id = req.auth.sub

    const [exists, currentLikes] = await Promise.all([
      PoolLike.count({ pool_id, user_id }),
      PoolLike.count({ pool_id })
    ])

    if (exists) {
      return currentLikes
    }

    const likes = currentLikes + 1
    await PoolLike.create({ pool_id, user_id, created_at: new Date() })
    await Pool.update({ likes }, { id: pool_id })
    return likes
  }

  async dislikePool(req: AuthRequest) {
    const parameters = new RequestParameters(req)
    const pool_id = parameters.getString('id')
    const user_id = req.auth.sub

    const [exists, currentLikes] = await Promise.all([
      PoolLike.count({ pool_id, user_id }),
      PoolLike.count({ pool_id })
    ])

    if (!exists) {
      return currentLikes
    }

    const likes = Math.max(currentLikes - 1, 0)
    await PoolLike.delete({ pool_id, user_id })
    await Pool.update({ likes }, { id: pool_id })
    return likes
  }
}
