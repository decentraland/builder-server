import { Response } from 'express'
import { env } from 'decentraland-commons'
import * as url from 'url'

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
    const builderTarget = url.resolve(BUILDER_URL, targetPath)
    if (!req.socialAgent) {
      return res.redirect(301, builderTarget)
    }

    const element = await this.findElementByType(id, type)

    if (!element) {
      return res.send(404)
    }

    const thumbnail =
      element.thumbnail &&
      `${BUILDER_URL}/v1/projects/${
        element.id
      }/media/thumbnail.png?updated_at=${Date.parse(
        element.updated_at.toString()
      )}`

    return res
      .status(200)
      .send(template({ ...element, url: builderTarget, thumbnail }))
  }

  private async findElementByType(
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
