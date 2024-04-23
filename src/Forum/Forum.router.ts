import { server } from 'decentraland-server'
import { Router } from '../common/Router'
import { HTTPError, STATUS_CODES } from '../common/HTTPError'
import { getValidator } from '../utils/validator'
import { withModelExists, withModelAuthorization } from '../middleware'
import { withAuthentication, AuthRequest } from '../middleware/authentication'
import { isErrorWithMessage } from '../utils/errors'
import {
  Collection,
  CollectionAttributes,
  CollectionService,
} from '../Collection'
import { isTPCollection } from '../utils/urn'
import { MAX_FORUM_ITEMS } from '../Item/utils'
import { Item } from '../Item'
import { Bridge } from '../ethereum/api/Bridge'
import { OwnableModel } from '../Ownable'
import { createPost } from './client'
import { ForumService } from './Forum.service'
import { ForumPost, forumPostSchema } from './Forum.types'

const validator = getValidator()

export class ForumRouter extends Router {
  public service = new ForumService()
  public collectionService = new CollectionService()

  private modelAuthorizationCheck = (
    _: OwnableModel,
    id: string,
    ethAddress: string
  ): Promise<boolean> => {
    return this.collectionService.isOwnedOrManagedBy(id, ethAddress)
  }

  mount() {
    const withCollectionExists = withModelExists(Collection, 'id')
    const withCollectionAuthorization = withModelAuthorization(
      Collection,
      'id',
      this.modelAuthorizationCheck
    )

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

  post = async (req: AuthRequest) => {
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
      if (isTPCollection(collection)) {
        // This logic is repeated in the Collection.router, we should generalize this behavior.
        const items = await Item.findOrderedByCollectionId(collectionId)

        const link = await this.service.upsertThirdPartyCollectionForumPost(
          collection,
          items
            .slice(0, MAX_FORUM_ITEMS)
            .map((item) => Bridge.toFullItem(item, collection))
        )
        return link
      } else {
        const { id, link } = await createPost(forumPost)
        await Collection.update<CollectionAttributes>(
          { forum_id: id, forum_link: link },
          { id: collectionId }
        )
        return link
      }
    } catch (error) {
      throw new HTTPError(
        'Error creating forum post',
        { errors: isErrorWithMessage(error) ? error.message : 'Unknown' },
        STATUS_CODES.error
      )
    }
  }
}
