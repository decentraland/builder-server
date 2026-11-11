import { createConsoleLogComponent } from '@well-known-components/logger'
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
  HUMAN_DECISION_EVENT_TYPES,
} from './CollectionEvent'
import { curationNotifications, CurationVerdict } from './notifications'
import { AutoCurationService } from './AutoCuration.service'
import { toAutoCurationHTTPError } from './AutoCuration.errors'
import { withCollectionLock } from './collectionLock'
import { isTPCollection } from '../utils/urn'

const validator = getValidator()
const logger = createConsoleLogComponent().getLogger('Curation')

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
    // Under the collection lock: a validator verdict reopening its own rejection must not interleave with a
    // curator's decision, nor two curators' identical decisions with each other.
    let result: Awaited<ReturnType<CurationRouter['updateCuration']>>
    try {
      result = await withCollectionLock(collectionId, () =>
        this.updateCuration(
          collectionId,
          ethAddress,
          curationJSON,
          CurationType.COLLECTION
        )
      )
    } catch (error) {
      throw toAutoCurationHTTPError(error, collectionId)
    }
    const { updated, previous, decisionRecorded } = result

    // Only real changes are announced, so repeating a PATCH cannot flood the channel.
    const assignee =
      curationJSON.assignee === undefined
        ? undefined
        : curationJSON.assignee
        ? curationJSON.assignee.toLowerCase()
        : null
    if (assignee !== undefined && assignee !== (previous.assignee ?? null)) {
      void curationNotifications.assigneeChanged(
        collectionId,
        assignee,
        ethAddress
      )
    }
    // Follows the timeline: a retried PATCH whose event was missing still announces the decision once.
    if (decisionRecorded) {
      void curationNotifications.verdictGiven(
        collectionId,
        curationJSON.status as CurationVerdict,
        ethAddress
      )
    }

    return updated
  }

  updateItemCuration = async (req: AuthRequest) => {
    const itemId = server.extractFromReq(req, 'id')
    const curationJSON: any = server.extractFromReq(req, 'curation')
    const ethAddress = req.auth.ethAddress

    const { updated } = await this.updateCuration(
      itemId,
      ethAddress,
      curationJSON,
      CurationType.ITEM
    )
    return updated
  }

  insertCollectionCuration = async (req: AuthRequest) => {
    try {
      const collectionId = server.extractFromReq(req, 'id')
      let curationJSON: Partial<CollectionCurationAttributes> | undefined
      try {
        curationJSON = server.extractFromReq(req, 'curation')
      } catch (error) {}
      const ethAddress = req.auth.ethAddress

      return await this.insertCuration(
        collectionId,
        ethAddress,
        CurationType.COLLECTION,
        curationJSON
      )
    } catch (error) {
      const autoCurationError = toAutoCurationHTTPError(
        error,
        server.extractFromReq(req, 'id')
      )
      if (autoCurationError instanceof HTTPError) {
        throw autoCurationError
      }
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

    if (curationJSON.assignee !== undefined) {
      if (!(await isCommitteeMember(ethAddress))) {
        throw new HTTPError(
          'Only committee members can modify the assignee',
          { id },
          STATUS_CODES.unauthorized
        )
      }
      if (curationJSON.assignee) {
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
    }

    // Creators reopen a review with a new request (POST), never by flipping the status of a decided one.
    if (
      (curationJSON.status === CurationStatus.APPROVED ||
        curationJSON.status === CurationStatus.REJECTED ||
        (type === CurationType.COLLECTION && curationJSON.status)) &&
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

    // A repeated decision leaves the reviewer and the reasons as the timeline has them.
    if (
      type === CurationType.COLLECTION &&
      (await this.isNewDecision(id, curationJSON, curation))
    ) {
      Object.assign(
        fieldsToUpdate,
        this.getCollectionReviewFields(ethAddress, curationJSON)
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

    const updated = await curationService.updateById(
      curation.id,
      fieldsToUpdate
    )

    const decisionRecorded =
      type === CurationType.COLLECTION &&
      (await this.recordCollectionReviewEvents(
        id,
        ethAddress,
        curationJSON,
        curation
      ))

    return { updated, previous: curation, decisionRecorded }
  }

  /** Rejections may carry the curator's reasons and message; the legacy Builder sends neither. */
  private getCollectionReviewFields = (
    ethAddress: string,
    curationJSON: any
  ): Partial<CollectionCurationAttributes> => {
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

    return {
      reviewed_by: ethAddress.toLowerCase(),
      ...(hasReasons ? { rejection_reasons: rejectionReasons } : {}),
      ...(hasMessage ? { rejection_message: rejectionMessage.trim() } : {}),
    }
  }

  /**
   * Keyed on the request, not on the row's status: a curator confirming the validator's rejection or reversing a
   * decision is new, a PATCH retried after the update still is, and a repeated decision by any curator is not.
   */
  private isNewDecision = async (
    collectionId: string,
    curationJSON: any,
    previous: CollectionCurationAttributes
  ): Promise<boolean> => {
    if (
      curationJSON.status !== CurationStatus.APPROVED &&
      curationJSON.status !== CurationStatus.REJECTED
    ) {
      return false
    }
    const decisionType =
      curationJSON.status === CurationStatus.APPROVED
        ? CollectionEventType.REVIEW_APPROVED
        : CollectionEventType.REVIEW_REJECTED
    const latestDecision = await CollectionEvent.findLatestByCollectionIdAndTypes(
      collectionId,
      HUMAN_DECISION_EVENT_TYPES
    )
    return !(
      latestDecision?.type === decisionType &&
      new Date(latestDecision.created_at) >= new Date(previous.created_at)
    )
  }

  /**
   * Only real decisions become events: a repeated PATCH must not reset the creator's attempts nor end a run.
   * Returns whether a decision was recorded.
   */
  private recordCollectionReviewEvents = async (
    collectionId: string,
    ethAddress: string,
    curationJSON: any,
    previous: CollectionCurationAttributes
  ): Promise<boolean> => {
    const base = {
      collection_id: collectionId,
      actor: CollectionEventActor.CURATOR,
      actor_address: ethAddress.toLowerCase(),
    }
    const assignee = curationJSON.assignee
      ? curationJSON.assignee.toLowerCase()
      : null
    const previousAssignee = previous.assignee
      ? previous.assignee.toLowerCase()
      : null

    if (curationJSON.assignee !== undefined && assignee !== previousAssignee) {
      await CollectionEvent.record({
        ...base,
        type: CollectionEventType.REVIEW_ASSIGNED,
        payload: { assignee },
      })
    }

    if (!(await this.isNewDecision(collectionId, curationJSON, previous))) {
      return false
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
          rejectionMessage: curationJSON.rejectionMessage?.trim() || null,
        },
      })
    }
    return true
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

    // A creator submitting changes waits for the running automatic review and for the daily limit; the
    // request is refused before anything is written so the client can tell them.
    const isChangesSubmission =
      type === CurationType.COLLECTION &&
      !attributes.assignee &&
      (await this.isChangesSubmission(id, curation, ethAddress))
    const submittedChanges = isChangesSubmission
      ? await this.autoCurationService.prepareChanges(id, curation?.status)
      : null

    const created = await curationService.getModel().create(attributes)

    if (type === CurationType.COLLECTION) {
      // A request opened with an assignee is a curator picking the collection up, not a creator's request.
      if (attributes.assignee) {
        void curationNotifications.assigneeChanged(
          id,
          attributes.assignee,
          ethAddress
        )
      } else if (isChangesSubmission) {
        void curationNotifications.reviewRequested(
          id,
          curation?.status,
          ethAddress
        )
        // Awaited: the client reads the timeline right after this answer, and the review start must be in it.
        if (submittedChanges) {
          await this.autoCurationService.onChangesSubmitted(
            submittedChanges,
            ethAddress
          )
        }
      }
    }

    return created
  }

  /**
   * A creator submitting changes: not a collection's first request (the publish already announced it and
   * started the full automatic review) nor a committee member's bookkeeping on someone else's collection.
   */
  private isChangesSubmission = async (
    collectionId: string,
    previousCuration: CollectionCurationAttributes | undefined,
    ethAddress: string
  ): Promise<boolean> => {
    const collection = await Collection.findOne<CollectionAttributes>(
      collectionId
    )
    if (!collection) {
      return false
    }
    const isOwner =
      collection.eth_address.toLowerCase() === ethAddress.toLowerCase()
    if (!isOwner && (await isCommitteeMember(ethAddress))) {
      return false
    }
    if (previousCuration) {
      return true
    }
    // The publish hook recorded the publication, so this is the request that follows it.
    const published = await CollectionEvent.findLatestByCollectionIdAndType(
      collectionId,
      CollectionEventType.COLLECTION_PUBLISHED
    )
    if (published) {
      return false
    }
    return this.mayHaveBeenApproved(collection)
  }

  /** Only a graph that answers "never approved" makes it a first request: down or blank reads as submitted changes. */
  private mayHaveBeenApproved = async (
    collection: CollectionAttributes
  ): Promise<boolean> => {
    if (isTPCollection(collection) || !collection.contract_address) {
      return false
    }
    try {
      const remoteCollection = await collectionAPI.fetchCollection(
        collection.contract_address
      )
      return !remoteCollection || remoteCollection.isApproved
    } catch (error) {
      logger.warn(
        `Could not read the approval of collection ${
          collection.id
        } from the graph, treating its request as submitted changes: ${
          (error as Error).message
        }`
      )
      return true
    }
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
