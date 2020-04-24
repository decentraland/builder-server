import { server } from 'decentraland-server'

import { Router } from '../common/Router'
import {
  withAuthentication,
  AuthRequest,
  withAuthenticationLegacy,
  AuthRequestLegacy
} from '../middleware'
import { AssetPack } from '../AssetPack'
import { Deployment } from '../Deployment'
import { PoolLike } from '../PoolLike'
import { Pool } from '../Pool'
import { Project } from '../Project'

export class MigrationRouter extends Router {
  mount() {
    /**
     * Retrieve projects to be migrated
     */
    this.router.get(
      '/migrate',
      withAuthenticationLegacy,
      server.handleRequest(this.fetchProjectsToMigrate)
    )

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

    // migrate asset packs
    const assetPacks = await AssetPack.update(
      { eth_address },
      { user_id, is_deleted: false }
    )

    // migrate deployments
    const deployments = await Deployment.update({ eth_address }, { user_id })

    // migrate likes
    const likes = await PoolLike.update({ eth_address }, { user_id })

    // migrate pools
    const pools = await Pool.update({ eth_address }, { user_id })

    // migrate projects
    const projects = await Project.update(
      { eth_address },
      { user_id, is_deleted: false }
    )

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

  async fetchProjectsToMigrate(req: AuthRequestLegacy) {
    const user_id = req.auth.sub
    const projects = await Project.find({ user_id, is_deleted: false })
    return projects
  }
}
