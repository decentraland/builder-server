import { server } from 'decentraland-server'
import { v4 as uuid } from 'uuid'
import { Router } from '../common/Router'
import { HTTPError, STATUS_CODES } from '../common/HTTPError'
import { withAuthentication, AuthRequest } from '../middleware'
import { isCommitteeMember } from '../Committee'
import { withCors } from '../middleware/cors'
import { collectionAPI } from '../ethereum/api/collection'
import { getValidator } from '../utils/validator'
import {
  Collection,
  CollectionAttributes,
  CollectionService,
} from '../Collection'
import { NonExistentItemError, UnpublishedItemError } from '../Item/Item.errors'
import { Item, ThirdPartyItemAttributes } from '../Item'
import { ItemService } from '../Item/Item.service'
import {
  NonExistentCollectionError,
  UnpublishedCollectionError,
} from '../Collection/Collection.errors'
import { createAssigneeEventPost, getPost } from '../Forum'
import {
  CurationStatus,
  CurationType,
  patchCurationSchema,
} from './Curation.types'
import { CurationService } from './Curation.service'
import {
  CollectionCuration,
  CollectionCurationAttributes,
} from './CollectionCuration'
import { ItemCuration, ItemCurationAttributes } from './ItemCuration'
import {
  CollectionEvent,
  CollectionEventActor,
  CollectionEventType,
} from './CollectionEvent'
import { AutoCurationService } from './AutoCuration.service'

const validator = getValidator()

const MAX_FORUM_POST_LENGTH = 10000

export class CurationRouter extends Router {
  public collectionService = new CollectionService()
  public autoCurationService = new AutoCurationService()

  mount() {
    // TODO: we might need to rename all endpoints to their actual entities:
    //   - /collections/:id/curation -> /collectionCurations/:id
    //   - /items/:id/curation -> /itemCurations/:id
    //   - etc

    /**
     * CORS for the OPTIONS header
     */
    this.router.options('/curations', withCors)
    this.router.options('/collections/:id/itemCurations', withCors)
    this.router.options('/collections/:id/curation', withCors)
    this.router.options('/collections/:id/curation/post', withCors)
    this.router.options('/items/:id/curation', withCors)

    this.router.get(
      '/curations',
      withCors,
      withAuthentication,
      server.handleRequest(this.getCollectionCurations)
    )

    this.router.get(
      '/collections/:id/itemCurations',
      withCors,
      withAuthentication,
      server.handleRequest(this.getCollectionItemCurations)
    )

    this.router.get(
      '/collections/:id/curation',
      withCors,
      withAuthentication,
      server.handleRequest(this.getCollectionCuration)
    )

    this.router.patch(
      '/collections/:id/curation',
      withCors,
      withAuthentication,
      server.handleRequest(this.updateCollectionCuration)
    )

    this.router.post(
      '/collections/:id/curation',
      withCors,
      withAuthentication,
      server.handleRequest(this.insertCollectionCuration)
    )

    this.router.post(
      '/collections/:id/curation/post',
      withCors,
      withAuthentication,
      server.handleRequest(this.createCurationNewAssigneePost)
    )

    this.router.get(
      '/items/:id/curation',
      withCors,
      withAuthentication,
      server.handleRequest(this.getItemCuration)
    )

    this.router.patch(
      '/items/:id/curation',
      withCors,
      withAuthentication,
      server.handleRequest(this.updateItemCuration)
    )

    this.router.post(
      '/items/:id/curation',
      withCors,
      withAuthentication,
      server.handleRequest(this.insertItemCuration)
    )
  }

  /**
   * This endpoint will return all collection curations an address has.
   * If the address is a commitee member, it'll return ALL curations. Otherwise it'll return the curations the address can see/manage.
   * Keep in mind that standard collections have a CollectionCuration that shows the state the collection is in it's curation process.
   * Conversely, TP collections have a virtual CollectionCuration which is created when its first item is curated. It'll remain `pending` forever
   */
  getCollectionCurations = async (req: AuthRequest) => {
    const ethAddress = req.auth.ethAddress
    const curationService = CurationService.byType(CurationType.COLLECTION)

    if (await isCommitteeMember(ethAddress)) {
      return curationService.getLatest()
    }

    const remoteCollections = await collectionAPI.fetchCollectionsByAuthorizedUser(
      ethAddress
    )

    const contractAddresses = remoteCollections.map(
      (collection) => collection.id
    )

    const [dbCollections, dbTPCollections] = await Promise.all([
      Collection.findByContractAddresses(contractAddresses),
      this.collectionService.getDbTPCollectionsByManager(ethAddress),
    ])

    const collectionIds = dbCollections
      .concat(dbTPCollections)
      .map((collection) => collection.id)

    return curationService.getLatestByIds(collectionIds)
  }

  getCollectionCuration = async (req: AuthRequest) => {
    const collectionId = server.extractFromReq(req, 'id')
    const ethAddress = req.auth.ethAddress
    const curationService = CurationService.byType(CurationType.COLLECTION)

    await this.validateAccessToCuration(
      curationService,
      ethAddress,
      collectionId
    )

    return curationService.getLatestById(collectionId)
  }

  getCollectionItemCurations = async (req: AuthRequest) => {
    const collectionId = server.extractFromReq(req, 'id')
    let itemIds: string[] | undefined
    try {
      itemIds = server.extractFromReq(req, 'itemIds')
    } catch (error) {}

    if (itemIds && !Array.isArray(itemIds)) {
      throw new HTTPError(
        'Invalid itemIds parameter provided.',
        { itemIds },
        STATUS_CODES.badRequest
      )
    }

    const ethAddress = req.auth.ethAddress
    const curationService = CurationService.byType(CurationType.COLLECTION)

    await this.validateAccessToCuration(
      curationService,
      ethAddress,
      collectionId
    )

    const curations = itemIds
      ? await ItemCuration.findByCollectionAndItemIds(collectionId, itemIds)
      : await ItemCuration.findByCollectionId(collectionId)

    return curations
  }

  getItemCuration = async (req: AuthRequest) => {
    const itemId = server.extractFromReq(req, 'id')
    const ethAddress = req.auth.ethAddress
    const curationService = CurationService.byType(CurationType.ITEM)

    await this.validateAccessToCuration(curationService, ethAddress, itemId)

    return curationService.getLatestById(itemId)
  }

  updateCollectionCuration = async (req: AuthRequest) => {
    const collectionId = server.extractFromReq(req, 'id')
    const curationJSON: any = server.extractFromReq(req, 'curation')
    const ethAddress = req.auth.ethAddress
    return this.updateCuration(
      collectionId,
      ethAddress,
      curationJSON,
      CurationType.COLLECTION
    )
  }

  updateItemCuration = async (req: AuthRequest) => {
    const itemId = server.extractFromReq(req, 'id')
    const curationJSON: any = server.extractFromReq(req, 'curation')
    const ethAddress = req.auth.ethAddress

    return this.updateCuration(
      itemId,
      ethAddress,
      curationJSON,
      CurationType.ITEM
    )
  }

  insertCollectionCuration = async (req: AuthRequest) => {
    try {
      const collectionId = server.extractFromReq(req, 'id')
      let curationJSON: Partial<CollectionCurationAttributes> | undefined
      try {
        curationJSON = server.extractFromReq(req, 'curation')
      } catch (error) {}
      const ethAddress = req.auth.ethAddress

      const curation = await this.insertCuration(
        collectionId,
        ethAddress,
        CurationType.COLLECTION,
        curationJSON
      )

      if (await this.autoCurationService.isEnabled()) {
        await this.autoCurationService.onChangesSubmitted(
          collectionId,
          ethAddress
        )
      }

      return curation
    } catch (error) {
      if (error instanceof NonExistentCollectionError) {
        throw new HTTPError(
          'Collection does not exist',
          { id: error.id },
          STATUS_CODES.notFound
        )
      }

      if (error instanceof UnpublishedCollectionError) {
        throw new HTTPError(
          'Collection is not published',
          { id: error.id },
          STATUS_CODES.unauthorized
        )
      }

      throw error
    }
  }

  insertItemCuration = async (req: AuthRequest) => {
    const ethAddress = req.auth.ethAddress

    try {
      const itemId = server.extractFromReq(req, 'id')

      return this.insertCuration(itemId, ethAddress, CurationType.ITEM)
    } catch (error) {
      if (error instanceof NonExistentItemError) {
        throw new HTTPError(
          error.message,
          { id: error.id },
          STATUS_CODES.notFound
        )
      } else if (error instanceof NonExistentCollectionError) {
        throw new HTTPError(
          'Not found',
          { id: error.id, ethAddress },
          STATUS_CODES.notFound
        )
      } else if (error instanceof UnpublishedItemError) {
        throw new HTTPError(
          error.message,
          { id: error.id },
          STATUS_CODES.conflict
        )
      }

      throw error
    }
  }

  createCurationNewAssigneePost = async (req: AuthRequest) => {
    const id = server.extractFromReq(req, 'id')
    const ethAddress = req.auth.ethAddress

    if (!(await isCommitteeMember(ethAddress))) {
      throw new HTTPError(
        'Unauthorized',
        { id, ethAddress },
        STATUS_CODES.unauthorized
      )
    }
    // Assignments are recorded as collection events instead once the auto curation is on.
    if (await this.autoCurationService.isEnabled()) {
      return
    }

    const collection = await Collection.findOne<CollectionAttributes>(id)
    if (!collection) {
      throw new HTTPError('Collection not found', { id }, STATUS_CODES.notFound)
    }
    if (!collection.forum_id) {
      throw new HTTPError(
        'The collection does not have a forum post yet',
        { id },
        STATUS_CODES.conflict
      )
    }

    const forumPostJSON = server.extractFromReq<{ raw?: unknown }>(
      req,
      'forumPost'
    )
    const raw = forumPostJSON?.raw
    if (
      typeof raw !== 'string' ||
      raw.length === 0 ||
      raw.length > MAX_FORUM_POST_LENGTH
    ) {
      throw new HTTPError('Invalid forum post', { id }, STATUS_CODES.badRequest)
    }

    const { topic_id } = await getPost(collection.forum_id)
    if (!topic_id) {
      throw new HTTPError(
        'The collection forum post has no topic',
        { id, forumId: collection.forum_id },
        STATUS_CODES.conflict
      )
    }

    await createAssigneeEventPost(topic_id, raw)
  }

  private updateCuration = async (
    id: string,
    ethAddress: string,
    curationJSON: any,
    type: CurationType
  ) => {
    const curationService = CurationService.byType(type)
    await this.validateAccessToCuration(curationService, ethAddress, id)

    const validate = validator.compile(patchCurationSchema)
    validate(curationJSON)

    if (validate.errors) {
      throw new HTTPError(
        'Invalid schema',
        validate.errors,
        STATUS_CODES.badRequest
      )
    }

    const curation = await curationService.getLatestById(id)

    if (!curation) {
      throw new HTTPError(
        'Curation does not exist',
        { id },
        STATUS_CODES.notFound
      )
    }

    if (curationJSON.assignee) {
      if (!(await isCommitteeMember(ethAddress))) {
        throw new HTTPError(
          'Only committee members can modify the assignee',
          { id },
          STATUS_CODES.unauthorized
        )
      }
      const isAssigneeCommitteeMember = await isCommitteeMember(
        curationJSON.assignee.toLowerCase()
      )
      if (!isAssigneeCommitteeMember) {
        throw new HTTPError(
          'The assignee must be a committee member',
          { id },
          STATUS_CODES.unauthorized
        )
      }
    }

    if (
      (curationJSON.status === CurationStatus.APPROVED ||
        curationJSON.status === CurationStatus.REJECTED) &&
      !(await isCommitteeMember(ethAddress))
    ) {
      throw new HTTPError(
        'Only committee members can approve or reject a curation',
        { id },
        STATUS_CODES.unauthorized
      )
    }

    if (type === CurationType.ITEM) {
      const { rowCount } = await CollectionCuration.updateByItemId(id)
      if (rowCount === 0) {
        throw new HTTPError(
          'Could not find a valid collection curation for the item',
          { itemId: id },
          STATUS_CODES.notFound
        )
      }
    }

    const fieldsToUpdate: Partial<
      CollectionCurationAttributes & ItemCurationAttributes
    > = {
      ...(curationJSON.assignee !== undefined
        ? {
            assignee: curationJSON.assignee
              ? curationJSON.assignee.toLowerCase()
              : null,
          }
        : {}),
      ...(curationJSON.status ? { status: curationJSON.status } : {}),
      updated_at: new Date(),
    }

    if (type === CurationType.COLLECTION) {
      Object.assign(
        fieldsToUpdate,
        await this.getCollectionReviewFields(id, ethAddress, curationJSON)
      )
    }

    if (curationJSON.status === CurationStatus.APPROVED) {
      await this.updateCollectionItemsContent(id)
    }

    if (type === CurationType.ITEM) {
      const itemData = await this.getItemCurationContentHashAndMappingCompletion(
        id
      )
      fieldsToUpdate.content_hash = itemData.content_hash
      fieldsToUpdate.is_mapping_complete = itemData.is_mapping_complete
    }

    const updatedCuration = await curationService.updateById(
      curation.id,
      fieldsToUpdate
    )

    if (type === CurationType.COLLECTION) {
      await this.recordCollectionReviewEvents(id, ethAddress, curationJSON)
    }

    return updatedCuration
  }

  /** Rejections carry the curator's reasons and message; both are mandatory once the auto curation is on. */
  private getCollectionReviewFields = async (
    id: string,
    ethAddress: string,
    curationJSON: any
  ): Promise<Partial<CollectionCurationAttributes>> => {
    const { status, rejectionReasons, rejectionMessage } = curationJSON

    if (status === CurationStatus.APPROVED) {
      return {
        reviewed_by: ethAddress.toLowerCase(),
        rejection_reasons: null,
        rejection_message: null,
      }
    }

    if (status !== CurationStatus.REJECTED) {
      return {}
    }

    const hasReasons =
      Array.isArray(rejectionReasons) && rejectionReasons.length > 0
    const hasMessage =
      typeof rejectionMessage === 'string' && rejectionMessage.trim() !== ''

    if (
      (!hasReasons || !hasMessage) &&
      (await this.autoCurationService.isEnabled())
    ) {
      throw new HTTPError(
        'Rejecting a collection requires rejectionReasons and rejectionMessage',
        { id },
        STATUS_CODES.badRequest
      )
    }

    return {
      reviewed_by: ethAddress.toLowerCase(),
      ...(hasReasons ? { rejection_reasons: rejectionReasons } : {}),
      ...(hasMessage ? { rejection_message: rejectionMessage.trim() } : {}),
    }
  }

  private recordCollectionReviewEvents = async (
    collectionId: string,
    ethAddress: string,
    curationJSON: any
  ): Promise<void> => {
    const base = {
      collection_id: collectionId,
      actor: CollectionEventActor.CURATOR,
      actor_address: ethAddress.toLowerCase(),
    }

    if (curationJSON.assignee !== undefined) {
      await CollectionEvent.record({
        ...base,
        type: CollectionEventType.REVIEW_ASSIGNED,
        payload: {
          assignee: curationJSON.assignee
            ? curationJSON.assignee.toLowerCase()
            : null,
        },
      })
    }

    if (curationJSON.status === CurationStatus.APPROVED) {
      await CollectionEvent.record({
        ...base,
        type: CollectionEventType.REVIEW_APPROVED,
        payload: {},
      })
    } else if (curationJSON.status === CurationStatus.REJECTED) {
      await CollectionEvent.record({
        ...base,
        type: CollectionEventType.REVIEW_REJECTED,
        payload: {
          rejectionReasons: curationJSON.rejectionReasons ?? [],
          rejectionMessage: curationJSON.rejectionMessage ?? null,
        },
      })
    }
  }

  private insertCuration = async (
    id: string,
    ethAddress: string,
    type: CurationType,
    curationJSON?: Partial<CollectionCurationAttributes>
  ) => {
    const curationService = CurationService.byType(type)
    await this.validateAccessToCuration(curationService, ethAddress, id)
    const curation = await curationService.getLatestById(id)

    if (!curation && type === CurationType.ITEM) {
      throw new HTTPError(
        "Item curations can't be created for items that weren't curated before",
        { id },
        STATUS_CODES.badRequest
      )
    }

    if (curation && curation.status === CurationStatus.PENDING) {
      throw new HTTPError(
        'There is already an ongoing review request',
        { id },
        STATUS_CODES.badRequest
      )
    }

    const attributes: Partial<
      CollectionCurationAttributes & ItemCurationAttributes
    > = {
      id: uuid(),
      status: CurationStatus.PENDING,
      created_at: new Date(),
      updated_at: new Date(),
    }

    if (type === CurationType.COLLECTION) {
      attributes.collection_id = id
      if (curationJSON?.assignee) {
        if (!(await isCommitteeMember(ethAddress))) {
          throw new HTTPError(
            'Only committee members can modify the assignee',
            { id },
            STATUS_CODES.unauthorized
          )
        }
        const isAssigneeCommitteeMember = await isCommitteeMember(
          curationJSON.assignee.toLowerCase()
        )
        if (!isAssigneeCommitteeMember) {
          throw new HTTPError(
            'The assignee must be a committee member',
            { id },
            STATUS_CODES.unauthorized
          )
        }
        attributes.assignee = curationJSON.assignee.toLowerCase()
      }
    }
    if (type === CurationType.ITEM) {
      const itemData = await this.getItemCurationContentHashAndMappingCompletion(
        id
      )
      attributes.item_id = id
      attributes.content_hash = itemData.content_hash
      attributes.is_mapping_complete = itemData.is_mapping_complete
    }

    return curationService.getModel().create(attributes)
  }

  private getItemCurationContentHashAndMappingCompletion = async (
    id: string
  ) => {
    const dbItem = await Item.findOne<ThirdPartyItemAttributes>(id)
    if (!dbItem) {
      throw new HTTPError(
        'There is no curation associated to that item',
        { id },
        STATUS_CODES.badRequest
      )
    }
    return {
      content_hash: dbItem.local_content_hash,
      is_mapping_complete: dbItem.mappings !== null,
    }
  }

  /* This method updates the video field of smart wearables
   * after the collection curation is approved.
   * This way we can handle if the video was updated after the collection was published
   */
  private updateCollectionItemsContent = async (collectionId: string) => {
    const itemService = new ItemService()
    await itemService.updateDCLItemsContent(collectionId)
  }

  private validateAccessToCuration = async (
    service: CurationService<any>,
    ethAddress: string,
    id: string
  ) => {
    let hasAccess: boolean
    try {
      hasAccess = await service.hasAccess(id, ethAddress)
    } catch (error) {
      if (error instanceof NonExistentCollectionError) {
        throw new HTTPError(
          'Not found',
          { id: error.id, ethAddress },
          STATUS_CODES.notFound
        )
      } else if (error instanceof UnpublishedCollectionError) {
        throw new HTTPError(
          'Unpublished collection',
          { id: error.id, ethAddress },
          STATUS_CODES.conflict
        )
      }
      throw error
    }

    if (!hasAccess) {
      throw new HTTPError(
        'Unauthorized',
        { id, ethAddress },
        STATUS_CODES.unauthorized
      )
    }
  }
}
