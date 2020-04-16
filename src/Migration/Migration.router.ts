import { server } from 'decentraland-server'

import { Router } from '../common/Router'
import {
  withAuthentication,
  AuthRequest,
  withAuthenticationLegacy
} from '../middleware'
import { AssetPack } from '../AssetPack'
import { Deployment } from '../Deployment'
import { PoolLike } from '../PoolLike'
import { Pool } from '../Pool'
import { Project } from '../Project'

export class MigrationRouter extends Router {
  mount() {
    /**
     * Performs a migration
     */
    this.router.post(
      '/migrate',
      // NOTE: it's important the legacy middleware comes before the new one
      withAuthenticationLegacy,
      withAuthentication,
      server.handleRequest(this.migrate)
    )
  }

  async migrate(req: AuthRequest) {
    const user_id = req.authLegacy!.sub
    const eth_address = req.auth.ethAddress
    console.log('migrate', user_id, eth_address)

    // migrate asset packs
    const assetPacks = await AssetPack.update({ eth_address }, { user_id })

    // migrate deployments
    const deployments = await Deployment.update({ eth_address }, { user_id })

    // migrate likes
    const likes = await PoolLike.update({ eth_address }, { user_id })

    // migrate pools
    const pools = await Pool.update({ eth_address }, { user_id })

    // migrate projects
    const projects = await Project.update({ eth_address }, { user_id })

    const result = {
      assetPacks,
      deployments,
      likes,
      pools,
      projects
    }

    // return only the `rowCount` of each result
    return Object.keys(result).reduce(
      (count, key) => ({
        ...count,
        [key]: result[key as keyof typeof result].rowCount
      }),
      {} as Record<string, number>
    )
  }
}
