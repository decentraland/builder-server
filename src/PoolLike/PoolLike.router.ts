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
    const currentEthAddress = (req.auth && req.auth.ethAddress) || null

    const filters: PoolLikeCount = { pool_id }
    if (parameters.has('address')) {
      const eth_address = parameters.getString('address')
      if (eth_address === 'me' || eth_address === currentEthAddress) {
        filters.eth_address = req.auth.ethAddress
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
    const eth_address = req.auth.ethAddress

    const [exists, currentLikes] = await Promise.all([
      PoolLike.count({ pool_id, eth_address }),
      PoolLike.count({ pool_id }),
    ])

    if (exists) {
      return currentLikes
    }

    const likes = currentLikes + 1
    await PoolLike.create({ pool_id, eth_address, created_at: new Date() })
    await Pool.update({ likes }, { id: pool_id })
    return likes
  }

  async dislikePool(req: AuthRequest) {
    const parameters = new RequestParameters(req)
    const pool_id = parameters.getString('id')
    const eth_address = req.auth.ethAddress

    const [exists, currentLikes] = await Promise.all([
      PoolLike.count({ pool_id, eth_address }),
      PoolLike.count({ pool_id }),
    ])

    if (!exists) {
      return currentLikes
    }

    const likes = Math.max(currentLikes - 1, 0)
    await PoolLike.delete({ pool_id, eth_address })
    await Pool.update({ likes }, { id: pool_id })
    return likes
  }
}
