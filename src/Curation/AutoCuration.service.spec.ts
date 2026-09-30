import { v4 as uuidv4 } from 'uuid'
import {
  dbCollectionMock,
  dbTPCollectionMock,
} from '../../spec/mocks/collections'
import { dbItemMock, itemFragmentMock } from '../../spec/mocks/items'
import { Collection } from '../Collection/Collection.model'
import { Item } from '../Item/Item.model'
import { ItemAttributes } from '../Item/Item.types'
import { collectionAPI } from '../ethereum/api/collection'
import { isFeatureFlagEnabled } from '../utils/features'
import { CollectionCuration } from './CollectionCuration'
import {
  CollectionEvent,
  CollectionEventActor,
  CollectionEventAttributes,
  CollectionEventType,
} from './CollectionEvent'
import { CurationStatus } from './Curation.types'
import { sendValidation } from './ccsClient'
import { notifyCurationSlack } from './slack'
import { ValidationResult } from './AutoCuration.types'
import {
  AppealAlreadyOpenError,
  CurationNotRejectedError,
  ValidationInProgressError,
  ValidationLimitReachedError,
} from './AutoCuration.errors'
import {
  AutoCurationService,
  countValidationAttempts,
  getStartOfTodayUTC,
  MAX_SWEEP_RESENDS,
  VALIDATOR_REVIEWER,
} from './AutoCuration.service'

jest.mock('../utils/features')
jest.mock('../Collection/Collection.model')
jest.mock('../Item/Item.model')
jest.mock('../ethereum/api/collection')
jest.mock('./CollectionEvent/CollectionEvent.model')
jest.mock('./CollectionCuration/CollectionCuration.model')
jest.mock('./ccsClient')
jest.mock('./slack', () => ({
  ...jest.requireActual('./slack'),
  notifyCurationSlack: jest.fn(),
}))

const mockIsFeatureFlagEnabled = isFeatureFlagEnabled as jest.Mock
const mockSendValidation = sendValidation as jest.Mock
const mockNotifySlack = notifyCurationSlack as jest.Mock
const mockRecordEvent = CollectionEvent.record as jest.Mock
const mockFindLatestEvent = CollectionEvent.findLatestByCollectionId as jest.Mock
const mockFindLatestEventByType = CollectionEvent.findLatestByCollectionIdAndType as jest.Mock
const mockFindEventsSince = CollectionEvent.findByCollectionIdSince as jest.Mock
const mockFindEventsPage = CollectionEvent.findPageByCollectionId as jest.Mock
const mockFindStaleAiStarted = CollectionEvent.findStaleAiStarted as jest.Mock
const mockFindVerdict = CollectionEvent.findVerdictByValidationId as jest.Mock
const mockCountSweepStarts = CollectionEvent.countSweepStartsSinceManualStart as jest.Mock
const mockFindLatestCuration = CollectionCuration.findLatestByCollectionId as jest.Mock
const mockCreateCuration = CollectionCuration.create as jest.Mock
const mockUpdateCuration = CollectionCuration.update as jest.Mock
const mockFindCollection = Collection.findOne as jest.Mock
const mockFindItemsByCollection = Item.findOrderedByCollectionId as jest.Mock
const mockFindItemsByIds = Item.findByIds as jest.Mock
const mockFetchRemoteItems = collectionAPI.fetchItemsByContractAddress as jest.Mock

const ethAddress = '0xAbC0000000000000000000000000000000000001'

function buildEvent(
  type: CollectionEventType,
  payload: Record<string, unknown> = {}
): CollectionEventAttributes {
  return {
    id: uuidv4(),
    collection_id: dbCollectionMock.id,
    type,
    actor: CollectionEventActor.VALIDATOR,
    actor_address: null,
    payload,
    created_at: new Date(),
  }
}

describe('AutoCurationService', () => {
  let service: AutoCurationService
  let item: ItemAttributes

  beforeAll(() => {
    process.env.CHAIN_NAME = 'Sepolia'
  })

  afterAll(() => {
    delete process.env.CHAIN_NAME
  })

  beforeEach(() => {
    service = new AutoCurationService()
    item = { ...dbItemMock, local_content_hash: 'localHash' }
    mockRecordEvent.mockImplementation((event) =>
      Promise.resolve({ id: uuidv4(), created_at: new Date(), ...event })
    )
  })

  afterEach(() => {
    jest.resetAllMocks()
    jest.useRealTimers()
  })

  describe('when counting the validation attempts of the day', () => {
    it('should count only the AI verdicts', () => {
      expect(
        countValidationAttempts([
          buildEvent(CollectionEventType.REVIEW_AI_STARTED),
          buildEvent(CollectionEventType.REVIEW_AI_ERROR),
          buildEvent(CollectionEventType.REVIEW_AI_REJECTED),
          buildEvent(CollectionEventType.REVIEW_AI_PASSED),
          buildEvent(CollectionEventType.COLLECTION_PUBLISHED),
        ])
      ).toBe(2)
    })

    it('should stop counting at the latest human decision', () => {
      expect(
        countValidationAttempts([
          buildEvent(CollectionEventType.REVIEW_AI_REJECTED),
          buildEvent(CollectionEventType.REVIEW_REJECTED),
          buildEvent(CollectionEventType.REVIEW_AI_REJECTED),
          buildEvent(CollectionEventType.REVIEW_AI_REJECTED),
        ])
      ).toBe(1)
    })
  })

  describe('when requesting a validation', () => {
    let previousStart: CollectionEventAttributes

    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-29T15:00:00.000Z'))
      previousStart = buildEvent(CollectionEventType.REVIEW_AI_STARTED, {
        validationId: 'previousValidation',
        trigger: 'publish',
        itemIds: [item.id],
      })
      mockFindCollection.mockResolvedValue(dbCollectionMock)
      mockFindEventsSince.mockResolvedValue([])
      mockFindLatestEventByType.mockResolvedValue(previousStart)
      mockFindVerdict.mockResolvedValue(
        buildEvent(CollectionEventType.REVIEW_AI_REJECTED, {
          validationId: 'previousValidation',
        })
      )
      mockFindLatestCuration.mockResolvedValue({
        id: 'curationId',
        status: CurationStatus.PENDING,
      })
      mockFindItemsByCollection.mockResolvedValue([item])
      mockFindItemsByIds.mockResolvedValue([item])
    })

    describe('and the latest validation start has no verdict yet', () => {
      beforeEach(() => {
        mockFindVerdict.mockResolvedValue(undefined)
      })

      it('should reject with a validation in progress error and not send anything', async () => {
        await expect(
          service.requestValidation(dbCollectionMock.id, ethAddress)
        ).rejects.toThrow(ValidationInProgressError)
        expect(mockFindVerdict).toHaveBeenCalledWith(
          dbCollectionMock.id,
          'previousValidation'
        )
        expect(mockSendValidation).not.toHaveBeenCalled()
        expect(mockRecordEvent).not.toHaveBeenCalled()
      })

      describe('and a curator was assigned after the start', () => {
        beforeEach(() => {
          mockFindLatestEvent.mockResolvedValue(
            buildEvent(CollectionEventType.REVIEW_ASSIGNED, { assignee: 'x' })
          )
        })

        it('should still reject with a validation in progress error', async () => {
          await expect(
            service.requestValidation(dbCollectionMock.id, ethAddress)
          ).rejects.toThrow(ValidationInProgressError)
          expect(mockRecordEvent).not.toHaveBeenCalled()
        })
      })
    })

    describe('and the latest validation ended with an error verdict', () => {
      beforeEach(() => {
        mockFindVerdict.mockResolvedValue(
          buildEvent(CollectionEventType.REVIEW_AI_ERROR, {
            validationId: 'previousValidation',
          })
        )
      })

      it('should start a new validation', async () => {
        await service.requestValidation(dbCollectionMock.id, ethAddress)

        expect(mockSendValidation).toHaveBeenCalledTimes(1)
      })
    })

    describe('and three verdicts were already issued today', () => {
      beforeEach(() => {
        mockFindLatestEvent.mockResolvedValue(
          buildEvent(CollectionEventType.REVIEW_AI_REJECTED)
        )
        mockFindEventsSince.mockResolvedValue([
          buildEvent(CollectionEventType.REVIEW_AI_REJECTED),
          buildEvent(CollectionEventType.REVIEW_AI_ERROR),
          buildEvent(CollectionEventType.REVIEW_AI_PASSED),
          buildEvent(CollectionEventType.REVIEW_AI_REJECTED),
        ])
      })

      it('should only look at the events since today at 00:00 UTC', async () => {
        await service
          .requestValidation(dbCollectionMock.id, ethAddress)
          .catch(() => undefined)

        expect(mockFindEventsSince).toHaveBeenCalledWith(
          dbCollectionMock.id,
          new Date('2026-09-29T00:00:00.000Z')
        )
      })

      it('should reject with a limit reached error pointing to the next UTC day', async () => {
        await expect(
          service.requestValidation(dbCollectionMock.id, ethAddress)
        ).rejects.toEqual(
          expect.objectContaining({
            retryAt: new Date('2026-09-30T00:00:00.000Z'),
          })
        )
        await expect(
          service.requestValidation(dbCollectionMock.id, ethAddress)
        ).rejects.toThrow(ValidationLimitReachedError)
        expect(mockSendValidation).not.toHaveBeenCalled()
      })
    })

    describe('and a curator decided after two of the three verdicts of the day', () => {
      beforeEach(() => {
        mockFindLatestEvent.mockResolvedValue(
          buildEvent(CollectionEventType.REVIEW_AI_REJECTED)
        )
        mockFindEventsSince.mockResolvedValue([
          buildEvent(CollectionEventType.REVIEW_AI_REJECTED),
          buildEvent(CollectionEventType.REVIEW_REJECTED),
          buildEvent(CollectionEventType.REVIEW_AI_REJECTED),
          buildEvent(CollectionEventType.REVIEW_AI_REJECTED),
        ])
      })

      it('should start a new validation', async () => {
        await service.requestValidation(dbCollectionMock.id, ethAddress)

        expect(mockRecordEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            type: CollectionEventType.REVIEW_AI_STARTED,
            payload: expect.objectContaining({ trigger: 'retry' }),
          })
        )
        expect(mockSendValidation).toHaveBeenCalledTimes(1)
      })
    })

    describe('and the latest curation is rejected', () => {
      beforeEach(() => {
        mockFindLatestCuration.mockResolvedValue({
          id: 'curationId',
          status: CurationStatus.REJECTED,
        })
      })

      it('should open a new pending curation', async () => {
        await service.requestValidation(dbCollectionMock.id, ethAddress)

        expect(mockCreateCuration).toHaveBeenCalledWith(
          expect.objectContaining({
            collection_id: dbCollectionMock.id,
            status: CurationStatus.PENDING,
            reviewed_by: null,
            rejection_reasons: null,
            rejection_message: null,
          })
        )
      })

      it('should validate the items of the previous run with a new validation id', async () => {
        const event = await service.requestValidation(
          dbCollectionMock.id,
          ethAddress
        )

        expect(mockFindItemsByIds).toHaveBeenCalledWith([item.id])
        expect(event.payload.validationId).not.toBe('previousValidation')
        expect(mockSendValidation).toHaveBeenCalledWith({
          validationId: event.payload.validationId,
          collectionId: dbCollectionMock.id,
          items: [
            {
              itemId: item.id,
              contentHash: 'localHash',
              metadata: expect.objectContaining({
                name: item.name,
                collectionAddress: dbCollectionMock.contract_address,
              }),
              contents: item.contents,
            },
          ],
        })
      })
    })

    describe('and the collection is a third party collection', () => {
      beforeEach(() => {
        mockFindCollection.mockResolvedValue(dbTPCollectionMock)
      })

      it('should reject without starting a validation', async () => {
        await expect(
          service.requestValidation(dbTPCollectionMock.id, ethAddress)
        ).rejects.toThrow(
          'Only standard collections can be validated automatically'
        )
        expect(mockRecordEvent).not.toHaveBeenCalled()
      })
    })
  })

  describe('when appealing a rejection', () => {
    beforeEach(() => {
      mockFindCollection.mockResolvedValue(dbCollectionMock)
      mockFindLatestCuration.mockResolvedValue({
        id: 'curationId',
        status: CurationStatus.REJECTED,
      })
      mockCreateCuration.mockImplementation((curation) =>
        Promise.resolve(curation)
      )
    })

    describe('and an appeal is already open', () => {
      beforeEach(() => {
        mockFindLatestEvent.mockResolvedValue(
          buildEvent(CollectionEventType.REVIEW_APPEAL_REQUESTED)
        )
      })

      it('should reject with an appeal already open error', async () => {
        await expect(
          service.appeal(dbCollectionMock.id, ethAddress, 'Please look again')
        ).rejects.toThrow(AppealAlreadyOpenError)
        expect(mockCreateCuration).not.toHaveBeenCalled()
      })
    })

    describe('and the latest curation is not rejected', () => {
      beforeEach(() => {
        mockFindLatestEvent.mockResolvedValue(
          buildEvent(CollectionEventType.REVIEW_AI_PASSED)
        )
        mockFindLatestCuration.mockResolvedValue({
          id: 'curationId',
          status: CurationStatus.PENDING,
        })
      })

      it('should reject with a curation not rejected error', async () => {
        await expect(
          service.appeal(dbCollectionMock.id, ethAddress, 'Please look again')
        ).rejects.toThrow(CurationNotRejectedError)
        expect(mockCreateCuration).not.toHaveBeenCalled()
      })
    })

    describe('and the latest curation is rejected', () => {
      beforeEach(() => {
        mockFindLatestEvent.mockResolvedValue(
          buildEvent(CollectionEventType.REVIEW_AI_REJECTED)
        )
      })

      it('should open a pending curation, record the appeal and notify Slack', async () => {
        const curation = await service.appeal(
          dbCollectionMock.id,
          ethAddress,
          'Please look again'
        )

        expect(curation).toEqual(
          expect.objectContaining({ status: CurationStatus.PENDING })
        )
        expect(mockRecordEvent).toHaveBeenCalledWith({
          collection_id: dbCollectionMock.id,
          type: CollectionEventType.REVIEW_APPEAL_REQUESTED,
          actor: CollectionEventActor.CREATOR,
          actor_address: ethAddress.toLowerCase(),
          payload: { note: 'Please look again' },
        })
        expect(mockNotifySlack).toHaveBeenCalledWith(
          expect.stringContaining('Please look again')
        )
      })

      it('should escape Slack markup in the note and the collection name', async () => {
        mockFindCollection.mockResolvedValue({
          ...dbCollectionMock,
          name: '<b>Hats</b> & co',
        })

        await service.appeal(
          dbCollectionMock.id,
          ethAddress,
          '<!channel> look at <https://evil.example|Approve in Builder>'
        )

        const [text] = mockNotifySlack.mock.calls[0]
        expect(text).toContain('&lt;b&gt;Hats&lt;/b&gt; &amp; co')
        expect(text).toContain(
          '&lt;!channel&gt; look at &lt;https://evil.example|Approve in Builder&gt;'
        )
        expect(text).not.toContain('<!channel>')
      })
    })
  })

  describe('when handling a validation result', () => {
    let result: ValidationResult

    beforeEach(() => {
      result = {
        validationId: 'latestValidation',
        verdict: 'passed',
        items: [
          {
            itemId: item.id,
            contentHash: 'localHash',
            passed: true,
            findings: [],
          },
        ],
      }
      mockFindCollection.mockResolvedValue(dbCollectionMock)
      mockFindLatestEventByType.mockResolvedValue(
        buildEvent(CollectionEventType.REVIEW_AI_STARTED, {
          validationId: 'latestValidation',
        })
      )
      mockFindLatestCuration.mockResolvedValue({
        id: 'curationId',
        status: CurationStatus.PENDING,
      })
    })

    describe('and the validation is not the latest one', () => {
      beforeEach(() => {
        result = {
          ...result,
          validationId: 'staleValidation',
          verdict: 'rejected',
        }
      })

      it('should ignore it without recording anything', async () => {
        await service.handleValidationResult(dbCollectionMock.id, result)

        expect(mockRecordEvent).not.toHaveBeenCalled()
        expect(mockUpdateCuration).not.toHaveBeenCalled()
        expect(mockNotifySlack).not.toHaveBeenCalled()
      })
    })

    describe('and a verdict for the validation was already recorded', () => {
      beforeEach(() => {
        mockFindVerdict.mockResolvedValue(
          buildEvent(CollectionEventType.REVIEW_AI_PASSED, {
            validationId: 'latestValidation',
          })
        )
      })

      it('should ignore the duplicate without recording or notifying', async () => {
        await service.handleValidationResult(dbCollectionMock.id, {
          ...result,
          verdict: 'rejected',
        })

        expect(mockRecordEvent).not.toHaveBeenCalled()
        expect(mockUpdateCuration).not.toHaveBeenCalled()
        expect(mockNotifySlack).not.toHaveBeenCalled()
      })
    })

    describe('and the verdict is passed', () => {
      it('should record the pass with the callback body and notify Slack', async () => {
        await service.handleValidationResult(dbCollectionMock.id, result)

        expect(mockRecordEvent).toHaveBeenCalledWith({
          collection_id: dbCollectionMock.id,
          type: CollectionEventType.REVIEW_AI_PASSED,
          actor: CollectionEventActor.VALIDATOR,
          actor_address: null,
          payload: result,
        })
        expect(mockUpdateCuration).not.toHaveBeenCalled()
        expect(mockNotifySlack).toHaveBeenCalledTimes(1)
      })
    })

    describe('and the verdict is rejected', () => {
      beforeEach(() => {
        result = { ...result, verdict: 'rejected' }
      })

      it('should reject the pending curation on behalf of the validator and record the verdict', async () => {
        await service.handleValidationResult(dbCollectionMock.id, result)

        expect(mockUpdateCuration).toHaveBeenCalledWith(
          {
            status: CurationStatus.REJECTED,
            reviewed_by: VALIDATOR_REVIEWER,
            updated_at: expect.any(Date),
          },
          { id: 'curationId' }
        )
        expect(mockRecordEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            type: CollectionEventType.REVIEW_AI_REJECTED,
            payload: result,
          })
        )
        expect(mockNotifySlack).not.toHaveBeenCalled()
      })

      describe('and a curator already decided on the curation', () => {
        beforeEach(() => {
          mockFindLatestCuration.mockResolvedValue({
            id: 'curationId',
            status: CurationStatus.APPROVED,
          })
        })

        it('should only record the verdict', async () => {
          await service.handleValidationResult(dbCollectionMock.id, result)

          expect(mockUpdateCuration).not.toHaveBeenCalled()
          expect(mockRecordEvent).toHaveBeenCalledTimes(1)
        })
      })
    })

    describe('and the verdict is error', () => {
      beforeEach(() => {
        result = { ...result, verdict: 'error' }
      })

      it('should record the error and notify Slack without touching the curation', async () => {
        await service.handleValidationResult(dbCollectionMock.id, result)

        expect(mockRecordEvent).toHaveBeenCalledWith(
          expect.objectContaining({ type: CollectionEventType.REVIEW_AI_ERROR })
        )
        expect(mockUpdateCuration).not.toHaveBeenCalled()
        expect(mockNotifySlack).toHaveBeenCalledTimes(1)
      })
    })
  })

  describe('when getting the events of a collection', () => {
    let aiEvent: CollectionEventAttributes
    let curatorEvent: CollectionEventAttributes

    beforeEach(() => {
      aiEvent = buildEvent(CollectionEventType.REVIEW_AI_REJECTED, {
        validationId: 'secret',
        verdict: 'rejected',
        items: [{ itemId: item.id, findings: [], visualSummary: 'A hat' }],
      })
      curatorEvent = buildEvent(CollectionEventType.REVIEW_REJECTED, {
        rejectionReasons: ['clipping'],
        rejectionMessage: 'Clips',
      })
      mockFindEventsPage.mockResolvedValue([
        { ...aiEvent, total_count: '7' },
        { ...curatorEvent, total_count: '7' },
      ])
    })

    describe('and the caller is not a committee member', () => {
      it('should drop the validation ids of the AI events and keep the rest', async () => {
        const page = await service.getEvents(dbCollectionMock.id, 2, 2, false)

        expect(mockFindEventsPage).toHaveBeenCalledWith(
          dbCollectionMock.id,
          2,
          2
        )
        expect(page).toEqual({
          results: [
            {
              ...aiEvent,
              payload: {
                verdict: 'rejected',
                items: [
                  { itemId: item.id, findings: [], visualSummary: 'A hat' },
                ],
              },
            },
            curatorEvent,
          ],
          total: 7,
          page: 2,
          limit: 2,
        })
      })
    })

    describe('and the caller is a committee member', () => {
      it('should keep the validation ids', async () => {
        const page = await service.getEvents(dbCollectionMock.id, 1, 50, true)

        expect(page.results[0].payload.validationId).toBe('secret')
      })
    })
  })

  describe('when the creator submits changes to a collection', () => {
    let unchangedItem: ItemAttributes
    let changedItem: ItemAttributes

    beforeEach(() => {
      unchangedItem = { ...item, id: uuidv4(), blockchain_item_id: '0' }
      changedItem = {
        ...item,
        id: uuidv4(),
        blockchain_item_id: '1',
        local_content_hash: 'newHash',
      }
      mockFindCollection.mockResolvedValue(dbCollectionMock)
      mockFindEventsSince.mockResolvedValue([])
      mockFindItemsByCollection.mockResolvedValue([unchangedItem, changedItem])
      mockFetchRemoteItems.mockResolvedValue([
        { ...itemFragmentMock, blockchainId: '0', contentHash: 'localHash' },
        { ...itemFragmentMock, blockchainId: '1', contentHash: 'oldHash' },
      ])
    })

    it('should record the changed items and validate only those', async () => {
      await service.onChangesSubmitted(dbCollectionMock.id, ethAddress)

      expect(mockRecordEvent).toHaveBeenCalledWith({
        collection_id: dbCollectionMock.id,
        type: CollectionEventType.CHANGES_SUBMITTED,
        actor: CollectionEventActor.CREATOR,
        actor_address: ethAddress.toLowerCase(),
        payload: { itemIds: [changedItem.id] },
      })
      expect(mockRecordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: CollectionEventType.REVIEW_AI_STARTED,
          payload: expect.objectContaining({
            trigger: 'changes',
            itemIds: [changedItem.id],
          }),
        })
      )
      expect(mockSendValidation).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [expect.objectContaining({ itemId: changedItem.id })],
        })
      )
    })

    describe('and a validation is in progress', () => {
      beforeEach(() => {
        mockFindLatestEventByType.mockResolvedValue(
          buildEvent(CollectionEventType.REVIEW_AI_STARTED, {
            validationId: 'running',
          })
        )
        mockFindVerdict.mockResolvedValue(undefined)
      })

      it('should record the changes without starting another validation', async () => {
        await service.onChangesSubmitted(dbCollectionMock.id, ethAddress)

        expect(mockRecordEvent).toHaveBeenCalledTimes(1)
        expect(mockRecordEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            type: CollectionEventType.CHANGES_SUBMITTED,
          })
        )
        expect(mockSendValidation).not.toHaveBeenCalled()
      })
    })

    describe('and the daily limit was reached', () => {
      beforeEach(() => {
        mockFindEventsSince.mockResolvedValue([
          buildEvent(CollectionEventType.REVIEW_AI_REJECTED),
          buildEvent(CollectionEventType.REVIEW_AI_REJECTED),
          buildEvent(CollectionEventType.REVIEW_AI_REJECTED),
        ])
      })

      it('should record the changes without starting a validation', async () => {
        await service.onChangesSubmitted(dbCollectionMock.id, ethAddress)

        expect(mockRecordEvent).toHaveBeenCalledTimes(1)
        expect(mockSendValidation).not.toHaveBeenCalled()
      })
    })

    describe('and fetching the on-chain items fails', () => {
      beforeEach(() => {
        mockFetchRemoteItems.mockRejectedValue(new Error('subgraph down'))
      })

      it('should resolve without throwing and record nothing', async () => {
        await expect(
          service.onChangesSubmitted(dbCollectionMock.id, ethAddress)
        ).resolves.toBeUndefined()

        expect(mockRecordEvent).not.toHaveBeenCalled()
        expect(mockSendValidation).not.toHaveBeenCalled()
      })
    })
  })

  describe('when sweeping stale validations', () => {
    let staleStart: CollectionEventAttributes

    beforeEach(() => {
      staleStart = buildEvent(CollectionEventType.REVIEW_AI_STARTED, {
        validationId: 'lost',
        trigger: 'publish',
        itemIds: [item.id],
      })
      mockFindStaleAiStarted.mockResolvedValue([staleStart])
      mockFindCollection.mockResolvedValue(dbCollectionMock)
      mockFindItemsByIds.mockResolvedValue([item])
    })

    describe('and the feature flag is off', () => {
      beforeEach(() => {
        mockIsFeatureFlagEnabled.mockResolvedValue(false)
      })

      it('should do nothing', async () => {
        await service.sweepStaleValidations()

        expect(mockFindStaleAiStarted).not.toHaveBeenCalled()
        expect(mockSendValidation).not.toHaveBeenCalled()
      })
    })

    describe('and the feature flag is on', () => {
      beforeEach(() => {
        mockIsFeatureFlagEnabled.mockResolvedValue(true)
        mockCountSweepStarts.mockResolvedValue(0)
      })

      it('should re-send the validation with a new id and the sweep trigger', async () => {
        await service.sweepStaleValidations()

        expect(mockRecordEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            type: CollectionEventType.REVIEW_AI_STARTED,
            payload: {
              validationId: expect.not.stringMatching(/^lost$/),
              trigger: 'sweep',
              itemIds: [item.id],
            },
          })
        )
        expect(mockSendValidation).toHaveBeenCalledTimes(1)
      })

      describe('and the collection was re-sent one time less than the cap', () => {
        beforeEach(() => {
          mockCountSweepStarts.mockResolvedValue(MAX_SWEEP_RESENDS - 1)
        })

        it('should still re-send the validation', async () => {
          await service.sweepStaleValidations()

          expect(mockSendValidation).toHaveBeenCalledTimes(1)
          expect(mockRecordEvent).not.toHaveBeenCalledWith(
            expect.objectContaining({
              type: CollectionEventType.REVIEW_AI_ERROR,
            })
          )
          expect(mockNotifySlack).not.toHaveBeenCalled()
        })
      })

      describe('and the collection reached the re-send cap', () => {
        beforeEach(() => {
          mockCountSweepStarts.mockResolvedValue(MAX_SWEEP_RESENDS)
        })

        it('should record an exhausted error, alert Slack and stop re-sending', async () => {
          await service.sweepStaleValidations()

          expect(mockRecordEvent).toHaveBeenCalledTimes(1)
          expect(mockRecordEvent).toHaveBeenCalledWith({
            collection_id: dbCollectionMock.id,
            type: CollectionEventType.REVIEW_AI_ERROR,
            actor: CollectionEventActor.VALIDATOR,
            actor_address: null,
            payload: { reason: 'sweep_exhausted', validationId: 'lost' },
          })
          expect(mockNotifySlack).toHaveBeenCalledTimes(1)
          expect(mockSendValidation).not.toHaveBeenCalled()
        })

        describe('and the creator retries afterwards', () => {
          beforeEach(() => {
            mockFindCollection.mockResolvedValue(dbCollectionMock)
            mockFindVerdict.mockResolvedValue(
              buildEvent(CollectionEventType.REVIEW_AI_ERROR, {
                reason: 'sweep_exhausted',
                validationId: 'lost',
              })
            )
            mockFindEventsSince.mockResolvedValue([])
            mockFindLatestEventByType.mockResolvedValue(staleStart)
            mockFindLatestCuration.mockResolvedValue({
              id: 'curationId',
              status: CurationStatus.PENDING,
            })
          })

          it('should accept the retry and let the sweep re-send again once the count is reset', async () => {
            await service.sweepStaleValidations()
            expect(mockSendValidation).not.toHaveBeenCalled()

            const retry = await service.requestValidation(
              dbCollectionMock.id,
              ethAddress
            )
            expect(retry.payload.trigger).toBe('retry')
            expect(mockSendValidation).toHaveBeenCalledTimes(1)

            mockCountSweepStarts.mockResolvedValue(0)
            await service.sweepStaleValidations()
            expect(mockSendValidation).toHaveBeenCalledTimes(2)
          })
        })
      })
    })
  })

  describe('when a standard collection is published', () => {
    beforeEach(() => {
      mockFindLatestCuration.mockResolvedValue(undefined)
      mockFindItemsByCollection.mockResolvedValue([item])
    })

    describe('and a validation of the collection is still running', () => {
      beforeEach(() => {
        mockFindLatestEventByType.mockResolvedValue({
          payload: { validationId: 'running' },
        })
        mockFindVerdict.mockResolvedValue(undefined)
      })

      it('should not record anything nor start a second validation', async () => {
        await service.onStandardCollectionPublished(dbCollectionMock, ethAddress)
        expect(mockRecordEvent).not.toHaveBeenCalled()
        expect(mockSendValidation).not.toHaveBeenCalled()
      })
    })

    it('should open a pending curation, record the publication with an empty payload and start the validation', async () => {
      await service.onStandardCollectionPublished(dbCollectionMock, ethAddress)

      expect(mockCreateCuration).toHaveBeenCalledWith(
        expect.objectContaining({ status: CurationStatus.PENDING })
      )
      expect(mockRecordEvent).toHaveBeenCalledWith({
        collection_id: dbCollectionMock.id,
        type: CollectionEventType.COLLECTION_PUBLISHED,
        actor: CollectionEventActor.CREATOR,
        actor_address: ethAddress.toLowerCase(),
        payload: {},
      })
      expect(mockRecordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: CollectionEventType.REVIEW_AI_STARTED,
          payload: expect.objectContaining({ trigger: 'publish' }),
        })
      )
      expect(mockSendValidation).toHaveBeenCalledTimes(1)
    })
  })

  describe('when computing the start of the day', () => {
    it('should return midnight UTC of the given date', () => {
      expect(getStartOfTodayUTC(new Date('2026-09-29T23:59:59.000Z'))).toEqual(
        new Date('2026-09-29T00:00:00.000Z')
      )
    })
  })
})
