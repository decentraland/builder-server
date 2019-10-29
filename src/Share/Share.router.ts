import { Response } from 'express'
import { env } from 'decentraland-commons'
import { format } from 'util'

import { Router } from '../common/Router'

import { Project } from '../Project/Project.model'
import { withSocialUserAgentDetector, SocialRequest } from '../middleware/share'
import { Params } from './Share.types'
import { Pool, PoolAttributes } from '../Pool'
import { ProjectAttributes } from '../Project'
import template from './template'

const BUILDER_URL = env.get('BUILDER_URL', '')

export class ShareRouter extends Router {
  mount() {
    /**
     * Redirect to scene
     */
    this.router.get(
      '/share/:type(scene|pool)/:id',
      withSocialUserAgentDetector,
      this.redirectToBuilder
    )
  }

  private redirectToBuilder = async (req: SocialRequest, res: Response) => {
    const { type, id } = req.params as Params
    const targetPath = type === 'scene' ? `/view/${id}` : `/view/${type}/${id}`
    const url = BUILDER_URL + targetPath
    if (!req.socialAgent) {
      return res.redirect(301, url)
    }

    const p = await this.findPoolOrProject(id, type)

    if (!p) {
      return res.send(404)
    }

    const thumbnail =
      p.thumbnail &&
      format(
        `${BUILDER_URL}/v1/projects/${
          p.id
        }/media/thumbnail.png?updated_at=${Date.parse(p.updated_at.toString())}`
      )

    return res.status(200).send(template({ ...p, url, thumbnail }))
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
