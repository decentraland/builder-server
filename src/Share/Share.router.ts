import { Response } from 'express'
import { server } from 'decentraland-server'
import { env } from 'decentraland-commons'

import { Router } from '../common/Router'

import { Project } from '../Project/Project.model'
import { withSocialUserAgentDetector, SocialRequest } from '../middleware/share'
import { Params } from './Share.types'
import { Pool, PoolAttributes } from '../Pool'
import { ProjectAttributes } from '../Project'

const BUILDER_URL = env.get('BUILDER_URL', '')

export class ShareRouter extends Router {
  mount() {
    /**
     * Redirect to scene
     */
    this.router.get(
      '/share/:type(scene|pool)/:id',
      withSocialUserAgentDetector,
      server.handleRequest(this.redirectToBuilder)
    )
  }

  async redirectToBuilder(req: SocialRequest, res: Response) {
    const { type, id } = req.params as Params
    if (!req.socialAgent) {
      switch (type) {
        case 'scene':
          return res.redirect(301, BUILDER_URL + `/view/${id}`)

        default:
          return res.redirect(301, BUILDER_URL + `/view/${type}/${id}`)
      }
    }

    const p = await this.findPoolOrProject(id, type)

    if (!p) {
      return res.send(404)
    }

    return p
  }

  private async findPoolOrProject(
    id: string,
    type: 'pool' | 'scene'
  ): Promise<ProjectAttributes | PoolAttributes | undefined> {
    if (type === 'pool') {
      return Pool.findOne<PoolAttributes>({ id })
    } else {
      return Project.findOne<ProjectAttributes>({ id, is_public: true })
    }
  }
}
