import * as url from 'url'
import { Response } from 'express'
import { env } from 'decentraland-commons'

import { Router } from '../common/Router'

import { Project } from '../Project/Project.model'
import { withSocialUserAgentDetector, SocialRequest } from '../middleware/share'
import { Params, ElementType } from './Share.types'
import { Pool, PoolAttributes } from '../Pool'
import { ProjectAttributes } from '../Project'
import template from './template'

const BUILDER_URL = env.get('BUILDER_URL', '')
const BUILDER_SERVER_URL = env.get('BUILDER_SERVER_URL', '')

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
      `${BUILDER_SERVER_URL}/v1/projects/${
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
    type: ElementType
  ): Promise<ProjectAttributes | PoolAttributes | undefined> {
    switch (type) {
      case ElementType.POOL:
        return Pool.findOne<PoolAttributes>({ id })

      case ElementType.SCENE:
        return Project.findOne<ProjectAttributes>({ id, is_public: true })

      default:
        throw new Error(`Unknown type ${type} for id ${id}`)
    }
  }
}
