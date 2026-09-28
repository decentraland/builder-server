import { server } from 'decentraland-server'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { Router } from '../common/Router'
import { HTTPError, STATUS_CODES } from '../common/HTTPError'
import { withModelExists, withModelAuthorization } from '../middleware'
import { withCors } from '../middleware/cors'
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
import { peerAPI } from '../ethereum/api/peer'
import { OwnableModel } from '../Ownable'
import { ExpressApp } from '../common/ExpressApp'
import { ForumService } from './Forum.service'
import { shortenAddress } from './utils'

export class ForumRouter extends Router {
  public service = new ForumService()
  public collectionService = new CollectionService()
  private logger: ILoggerComponent.ILogger

  constructor(router: ExpressApp, logger: ILoggerComponent) {
    super(router)
    this.logger = logger.getLogger('ForumRouter')
  }

  mount() {
    const withCollectionExists = withModelExists(Collection, 'id')
    const withCollectionAuthorization = withModelAuthorization(
      Collection,
      'id',
      this.modelAuthorizationCheck
    )

    this.router.options('/collections/:id/post', withCors)

    this.router.post(
      '/collections/:id/post',
      withCors,
      withAuthentication,
      withCollectionExists,
      withCollectionAuthorization,
      server.handleRequest(this.post)
    )
  }

  post = async (req: AuthRequest) => {
    const collectionId: string = server.extractFromReq(req, 'id')
    const collection = await Collection.findOne<CollectionAttributes>(
      collectionId
    )
    if (!collection) {
      this.logger.error(
        `Error trying to create the forum post for ${collectionId}, collection not found`
      )
      throw new HTTPError(
        'Collection not found',
        { id: collectionId },
        STATUS_CODES.notFound
      )
    }
    const isTP = isTPCollection(collection)

    if (!isTP) {
      const isPublished =
        !!collection.contract_address &&
        (await this.collectionService.isDCLPublished(
          collection.contract_address
        ))
      if (!isPublished) {
        this.logger.error(
          `Error trying to create the forum post for ${collectionId}, collection is not published`
        )
        throw new HTTPError(
          'The collection is not published',
          { id: collectionId },
          STATUS_CODES.unauthorized
        )
      }
    }

    if (collection.forum_link) {
      this.logger.warn(
        `Forum post already exists for ${collectionId}, returning the existing link`
      )
      throw new HTTPError(
        'Forum post already exists',
        { id: collectionId, forum_link: collection.forum_link },
        STATUS_CODES.conflict
      )
    }

    try {
      const items = (await Item.findOrderedByCollectionId(collectionId))
        .slice(0, MAX_FORUM_ITEMS)
        .map((item) => Bridge.toFullItem(item, collection))

      if (isTP) {
        return await this.service.upsertThirdPartyCollectionForumPost(
          collection,
          items
        )
      }

      const createdBy =
        (await peerAPI.getProfileName(collection.eth_address)) ??
        shortenAddress(collection.eth_address)

      return await this.service.upsertStandardCollectionForumPost(
        collection,
        items,
        createdBy
      )
    } catch (error) {
      this.logger.error(
        `Error trying to create the forum post for ${collectionId}: ${
          isErrorWithMessage(error) ? error.message : 'Unknown'
        }`
      )
      throw new HTTPError(
        'Error creating forum post',
        { errors: isErrorWithMessage(error) ? error.message : 'Unknown' },
        STATUS_CODES.error
      )
    }
  }

  private modelAuthorizationCheck = (
    _: OwnableModel,
    id: string,
    ethAddress: string
  ): Promise<boolean> => {
    return this.collectionService.isOwnedOrManagedBy(id, ethAddress)
  }
}
