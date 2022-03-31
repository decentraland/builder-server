import { server } from 'decentraland-server'

import { Router } from '../common/Router'
import { HTTPError, STATUS_CODES } from '../common/HTTPError'
import { getValidator } from '../utils/validator'
import { withModelExists, withModelAuthorization } from '../middleware'
import { withAuthentication, AuthRequest } from '../middleware/authentication'
import { Collection, CollectionAttributes } from '../Collection'
import { createPost } from './client'
import { ForumPost, forumPostSchema } from './Forum.types'

const validator = getValidator()

export class ForumRouter extends Router {
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
      server.handleRequest(this.post)
    )
  }

  async post(req: AuthRequest) {
    const collectionId: string = server.extractFromReq(req, 'id')
    const forumPostJSON: any = server.extractFromReq(req, 'forumPost')

    const validate = validator.compile(forumPostSchema)
    validate(forumPostJSON)

    if (validate.errors) {
      throw new HTTPError('Invalid schema', validate.errors)
    }
    const forumPost: ForumPost = forumPostJSON as ForumPost

    const collection = await Collection.findOne(collectionId)
    if (collection.forum_link) {
      throw new HTTPError('Forum post already exists', { id: collectionId })
    }

    try {
      const { id, link } = await createPost(forumPost)
      await Collection.update<CollectionAttributes>(
        { forum_id: id, forum_link: link },
        { id: collectionId }
      )

      return link
    } catch (error) {
      throw new HTTPError(
        'Error creating forum post',
        { errors: error.message },
        STATUS_CODES.error
      )
    }
  }
}
