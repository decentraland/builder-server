import { server } from 'decentraland-server'
import { Router } from '../common/Router'
import { HTTPError, STATUS_CODES } from '../common/HTTPError'
import { getValidator } from '../utils/validator'
import { withModelExists, withModelAuthorization } from '../middleware'
import { withAuthentication, AuthRequest } from '../middleware/authentication'
import { MetricDeclarations } from '../MetricsDeclarations'
import { Collection, CollectionAttributes } from '../Collection'
import { createPost } from './client'
import { ForumPost, forumPostSchema } from './Forum.types'

const validator = getValidator()

export class ForumRouter extends Router<MetricDeclarations> {
  mount() {
    const withCollectionExists = withModelExists(Collection, 'id')
    const withCollectionAuthorization = withModelAuthorization(Collection)

    /**
     * Post a new thread to the forum
     */
    this.router.post(
      '/collections/:id/post',
      withAuthentication,
      withCollectionExists,
      withCollectionAuthorization,
      server.handleRequest(this.post.bind(this))
    )
  }

  async post(req: AuthRequest) {
    const id: string = server.extractFromReq(req, 'id')
    const forumPostJSON: any = server.extractFromReq(req, 'forumPost')

    const validate = validator.compile(forumPostSchema)
    validate(forumPostJSON)

    if (validate.errors) {
      throw new HTTPError('Invalid schema', validate.errors)
    }
    const forumPost: ForumPost = forumPostJSON as ForumPost

    const collection = await Collection.findOne(id)
    if (collection.forum_link) {
      this.metrics!.increment(
        'dcl_published_collection_forum_post_already_exists'
      )
      throw new HTTPError(
        'Forum post already exists',
        { id, forum_link: collection.forum_link },
        STATUS_CODES.conflict
      )
    }

    try {
      const forum_link = await createPost(forumPost)
      await Collection.update<CollectionAttributes>({ forum_link }, { id })

      return forum_link
    } catch (error) {
      this.metrics!.increment('dcl_published_collection_forum_post_failed')
      throw new HTTPError(
        'Error creating forum post',
        { errors: error.message },
        STATUS_CODES.error
      )
    }
  }
}
