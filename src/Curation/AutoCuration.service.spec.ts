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
import { curationNotifications } from './notifications'
import { calculateItemContentHash } from '../Item/hashes'
import {
  requestValidation as sendValidation,
  ValidationTooLargeError,
} from './validationQueue'
import { notifyCurationSlack } from './slack'
import { ValidationResult } from './AutoCuration.types'
import {
  AppealAlreadyOpenError,
  CurationNotRejectedError,
  CurationRejectedByCuratorError,
  NothingToRevalidateError,
  NothingToValidateError,
  ValidationInProgressError,
  ValidationLimitReachedError,
} from './AutoCuration.errors'
import {
  AutoCurationService,
  countValidationAttempts,
  getStartOfTodayUTC,
  MAX_SWEEP_RESENDS,
  STALE_VALIDATION_MS,
  SWEEP_LOOKBACK_MS,
  VALIDATOR_REVIEWER,
} from './AutoCuration.service'

jest.mock('../utils/features')
jest.mock('../Collection/Collection.model')
jest.mock('../Item/Item.model')
jest.mock('../ethereum/api/collection')
jest.mock('./CollectionEvent/CollectionEvent.model')
jest.mock('./CollectionCuration/CollectionCuration.model')
jest.mock('./notifications')
jest.mock('../Item/hashes', () => ({
  ...jest.requireActual('../Item/hashes'),
  calculateItemContentHash: jest.fn(),
}))
jest.mock('./collectionLock', () => ({
  withCollectionLock: (_: string, task: () => Promise<unknown>) => task(),
}))
jest.mock('./validationQueue', () => ({
  ...jest.requireActual('./validationQueue'),
  requestValidation: jest.fn(),
}))
jest.mock('./slack', () => ({
  ...jest.requireActual('./slack'),
  notifyCurationSlack: jest.fn(),
}))

const mockIsFeatureFlagEnabled = isFeatureFlagEnabled as jest.Mock
const mockSendValidation = sendValidation as jest.Mock
const mockNotifySlack = notifyCurationSlack as jest.Mock
const mockNotifyNotRequested = curationNotifications.validationNotRequested as jest.Mock
const mockCalculateHash = calculateItemContentHash as jest.Mock
const mockRecordEvent = CollectionEvent.record as jest.Mock
const mockRecordEventOnce = CollectionEvent.recordOnce as jest.Mock
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
    process.env.AWS_SNS_ARN = 'arn:aws:sns:us-east-1:000000000000:events'
  })

  afterAll(() => {
    delete process.env.CHAIN_NAME
    delete process.env.AWS_SNS_ARN
  })

  beforeEach(() => {
    service = new AutoCurationService()
    item = { ...dbItemMock, local_content_hash: 'localHash' }
    mockIsFeatureFlagEnabled.mockResolvedValue(true)
    mockCalculateHash.mockResolvedValue('computedHash')
    jest.spyOn(console, 'log').mockImplementation(() => undefined)
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
    mockRecordEvent.mockImplementation((event) =>
      Promise.resolve({ id: uuidv4(), created_at: new Date(), ...event })
    )
    mockRecordEventOnce.mockImplementation((event) =>
      Promise.resolve({ id: uuidv4(), created_at: new Date(), ...event })
    )
  })

  afterEach(() => {
    jest.resetAllMocks()
    jest.restoreAllMocks()
    jest.useRealTimers()
  })

  describe('when counting the validation attempts of the day', () => {
    it('should count the starts the creator caused, not the sweep re-sends nor the verdicts', () => {
      expect(
        countValidationAttempts([
          buildEvent(CollectionEventType.REVIEW_AI_STARTED, {
            trigger: 'sweep',
          }),
          buildEvent(CollectionEventType.REVIEW_AI_ERROR),
          buildEvent(CollectionEventType.REVIEW_AI_STARTED, {
            trigger: 'retry',
          }),
          buildEvent(CollectionEventType.REVIEW_AI_REJECTED),
          buildEvent(CollectionEventType.REVIEW_AI_STARTED, {
            trigger: 'changes',
          }),
          buildEvent(CollectionEventType.REVIEW_AI_PASSED),
          buildEvent(CollectionEventType.REVIEW_AI_STARTED, {
            trigger: 'publish',
          }),
          buildEvent(CollectionEventType.COLLECTION_PUBLISHED),
        ])
      ).toBe(3)
    })

    it('should not count a start whose request never reached the topic', () => {
      expect(
        countValidationAttempts([
          buildEvent(CollectionEventType.REVIEW_AI_ERROR, {
            reason: 'publish_failed',
            validationId: 'unsent',
          }),
          buildEvent(CollectionEventType.REVIEW_AI_STARTED, {
            trigger: 'retry',
            validationId: 'unsent',
          }),
          buildEvent(CollectionEventType.REVIEW_AI_STARTED, {
            trigger: 'publish',
            validationId: 'sent',
          }),
        ])
      ).toBe(1)
    })

    it('should stop counting at the latest human decision', () => {
      expect(
        countValidationAttempts([
          buildEvent(CollectionEventType.REVIEW_AI_STARTED, {
            trigger: 'retry',
          }),
          buildEvent(CollectionEventType.REVIEW_REJECTED),
          buildEvent(CollectionEventType.REVIEW_AI_STARTED, {
            trigger: 'retry',
          }),
          buildEvent(CollectionEventType.REVIEW_AI_STARTED, {
            trigger: 'publish',
          }),
        ])
      ).toBe(1)
    })
  })

  describe('when requesting a validation', () => {
    let previousStart: CollectionEventAttributes

    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-29T15:00:00.000Z'))
      previousStart = {
        ...buildEvent(CollectionEventType.REVIEW_AI_STARTED, {
          validationId: 'previousValidation',
          trigger: 'publish',
          itemIds: [item.id],
          contentHashes: { [item.id]: 'oldHash' },
        }),
        created_at: new Date('2026-09-29T14:00:00.000Z'),
      }
      mockFindCollection.mockResolvedValue(dbCollectionMock)
      mockFindEventsSince.mockResolvedValue([])
      mockFindLatestEventByType.mockImplementation((_, type) =>
        Promise.resolve(
          type === CollectionEventType.REVIEW_AI_STARTED
            ? previousStart
            : undefined
        )
      )
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

      describe('and a curator decided the collection after the start', () => {
        beforeEach(() => {
          mockFindLatestEventByType.mockImplementation((_, type) =>
            Promise.resolve(
              type === CollectionEventType.REVIEW_AI_STARTED
                ? previousStart
                : type === CollectionEventType.REVIEW_REJECTED
                ? {
                    ...buildEvent(CollectionEventType.REVIEW_REJECTED),
                    created_at: new Date('2026-09-29T14:10:00.000Z'),
                  }
                : undefined
            )
          )
        })

        it('should treat the run as over and start a new validation', async () => {
          await service.requestValidation(dbCollectionMock.id, ethAddress)

          expect(mockSendValidation).toHaveBeenCalledTimes(1)
        })
      })
    })

    describe('and the latest validation was handed to a curator as unsupported', () => {
      beforeEach(() => {
        mockFindVerdict.mockResolvedValue(
          buildEvent(CollectionEventType.REVIEW_HUMAN_REQUIRED, {
            reason: 'unsupported_items',
            validationId: 'previousValidation',
            items: [],
          })
        )
      })

      it('should not consider it in progress and start a new validation', async () => {
        await service.requestValidation(dbCollectionMock.id, ethAddress)

        expect(mockSendValidation).toHaveBeenCalledTimes(1)
      })
    })

    describe('and no item changed since the latest validation started', () => {
      beforeEach(() => {
        previousStart.payload.contentHashes = { [item.id]: 'localHash' }
      })

      it('should reject with a nothing to revalidate error and not send anything', async () => {
        await expect(
          service.requestValidation(dbCollectionMock.id, ethAddress)
        ).rejects.toThrow(NothingToRevalidateError)
        expect(mockSendValidation).not.toHaveBeenCalled()
        expect(mockCreateCuration).not.toHaveBeenCalled()
      })

      describe('and the latest validation ended with a retryable error', () => {
        beforeEach(() => {
          mockFindVerdict.mockResolvedValue(
            buildEvent(CollectionEventType.REVIEW_AI_ERROR, {
              validationId: 'previousValidation',
              reason: 'sweep_exhausted',
            })
          )
        })

        it('should re-run the same items', async () => {
          await service.requestValidation(dbCollectionMock.id, ethAddress)

          expect(mockSendValidation).toHaveBeenCalledWith(
            expect.objectContaining({
              items: [expect.objectContaining({ itemId: item.id })],
            })
          )
        })
      })

      describe('and the latest validation was too large to send', () => {
        beforeEach(() => {
          mockFindVerdict.mockResolvedValue(
            buildEvent(CollectionEventType.REVIEW_AI_ERROR, {
              validationId: 'previousValidation',
              reason: 'too_large',
            })
          )
        })

        it('should reject with a nothing to revalidate error', async () => {
          await expect(
            service.requestValidation(dbCollectionMock.id, ethAddress)
          ).rejects.toThrow(NothingToRevalidateError)
        })
      })
    })

    describe('and an item outside the latest validation changed since it started', () => {
      let editedItem: ItemAttributes

      beforeEach(() => {
        previousStart.payload.contentHashes = { [item.id]: 'localHash' }
        editedItem = {
          ...item,
          id: 'b43f3350-ff47-4766-8b0e-28744b66e4a1',
          local_content_hash: 'editedHash',
        }
        mockFindItemsByIds.mockResolvedValue([item])
        mockFindItemsByCollection.mockResolvedValue([item, editedItem])
      })

      it('should validate the edited item and the previous ones', async () => {
        await service.requestValidation(dbCollectionMock.id, ethAddress)

        expect(mockSendValidation).toHaveBeenCalledWith(
          expect.objectContaining({
            items: [
              expect.objectContaining({ itemId: editedItem.id }),
              expect.objectContaining({ itemId: item.id }),
            ],
          })
        )
      })

      describe('and the edited item has no stored hash', () => {
        beforeEach(() => {
          editedItem = { ...editedItem, local_content_hash: null }
          mockFindItemsByCollection.mockResolvedValue([item, editedItem])
        })

        it('should hash it to tell whether it changed', async () => {
          await service.requestValidation(dbCollectionMock.id, ethAddress)

          expect(mockCalculateHash).toHaveBeenCalledWith(
            editedItem,
            dbCollectionMock
          )
          expect(mockSendValidation).toHaveBeenCalledWith(
            expect.objectContaining({
              items: expect.arrayContaining([
                expect.objectContaining({
                  itemId: editedItem.id,
                  contentHash: 'computedHash',
                }),
              ]),
            })
          )
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

    describe('and three automatic reviews were already used today', () => {
      beforeEach(() => {
        mockFindLatestEvent.mockResolvedValue(
          buildEvent(CollectionEventType.REVIEW_AI_REJECTED)
        )
        mockFindEventsSince.mockResolvedValue([
          buildEvent(CollectionEventType.REVIEW_AI_REJECTED),
          buildEvent(CollectionEventType.REVIEW_AI_STARTED, {
            trigger: 'retry',
          }),
          buildEvent(CollectionEventType.REVIEW_AI_STARTED, {
            trigger: 'sweep',
          }),
          buildEvent(CollectionEventType.REVIEW_AI_STARTED, {
            trigger: 'changes',
          }),
          buildEvent(CollectionEventType.REVIEW_AI_STARTED, {
            trigger: 'publish',
          }),
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

    describe('and a curator decided after two of the three reviews of the day', () => {
      beforeEach(() => {
        mockFindLatestEvent.mockResolvedValue(
          buildEvent(CollectionEventType.REVIEW_AI_REJECTED)
        )
        mockFindEventsSince.mockResolvedValue([
          buildEvent(CollectionEventType.REVIEW_AI_STARTED, {
            trigger: 'retry',
          }),
          buildEvent(CollectionEventType.REVIEW_REJECTED),
          buildEvent(CollectionEventType.REVIEW_AI_STARTED, {
            trigger: 'retry',
          }),
          buildEvent(CollectionEventType.REVIEW_AI_STARTED, {
            trigger: 'publish',
          }),
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

    describe('and the latest curation was rejected by a curator', () => {
      beforeEach(() => {
        mockFindLatestCuration.mockResolvedValue({
          id: 'curationId',
          status: CurationStatus.REJECTED,
          reviewed_by: '0xcurator',
        })
      })

      it('should reject with a rejected by curator error and not send anything', async () => {
        await expect(
          service.requestValidation(dbCollectionMock.id, ethAddress)
        ).rejects.toThrow(CurationRejectedByCuratorError)
        expect(mockCreateCuration).not.toHaveBeenCalled()
        expect(mockSendValidation).not.toHaveBeenCalled()
      })
    })

    describe('and the collection has no curation at all', () => {
      beforeEach(() => {
        mockFindLatestCuration.mockResolvedValue(undefined)
      })

      it('should start the validation without opening one', async () => {
        await service.requestValidation(dbCollectionMock.id, ethAddress)

        expect(mockCreateCuration).not.toHaveBeenCalled()
        expect(mockSendValidation).toHaveBeenCalledTimes(1)
      })
    })

    describe('and the latest curation was rejected by the validator', () => {
      beforeEach(() => {
        mockFindLatestCuration.mockResolvedValue({
          id: 'curationId',
          status: CurationStatus.REJECTED,
          reviewed_by: VALIDATOR_REVIEWER,
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

    describe('and the collection is approved', () => {
      beforeEach(() => {
        mockFindLatestCuration.mockResolvedValue({
          id: 'curationId',
          status: CurationStatus.APPROVED,
        })
      })

      it('should send the creator to submit their changes for review instead', async () => {
        await expect(
          service.requestValidation(dbCollectionMock.id, ethAddress)
        ).rejects.toThrow(NothingToValidateError)
        expect(mockSendValidation).not.toHaveBeenCalled()
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

  describe('when a third party collection is published', () => {
    it('should hand it to the curators once, whatever the number of batches', async () => {
      mockFindLatestEventByType
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(
          buildEvent(CollectionEventType.REVIEW_HUMAN_REQUIRED, {
            reason: 'third_party',
          })
        )

      await service.onThirdPartyCollectionPublished(dbTPCollectionMock)
      await service.onThirdPartyCollectionPublished(dbTPCollectionMock)

      expect(mockRecordEvent).toHaveBeenCalledTimes(1)
      expect(mockRecordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: CollectionEventType.REVIEW_HUMAN_REQUIRED,
          payload: { reason: 'third_party' },
        })
      )
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
        mockFindLatestCuration.mockResolvedValue({
          id: 'curationId',
          status: CurationStatus.PENDING,
        })
      })

      it('should reject with an appeal already open error', async () => {
        await expect(
          service.appeal(dbCollectionMock.id, ethAddress, 'Please look again')
        ).rejects.toThrow(AppealAlreadyOpenError)
        expect(mockCreateCuration).not.toHaveBeenCalled()
      })
    })

    describe('and an earlier appeal was recorded but its request never opened', () => {
      beforeEach(() => {
        mockFindLatestEvent.mockResolvedValue(
          buildEvent(CollectionEventType.REVIEW_APPEAL_REQUESTED)
        )
      })

      it('should open the request without recording the appeal twice', async () => {
        await service.appeal(
          dbCollectionMock.id,
          ethAddress,
          'Please look again'
        )

        expect(mockCreateCuration).toHaveBeenCalledWith(
          expect.objectContaining({ status: CurationStatus.PENDING })
        )
        expect(mockRecordEvent).not.toHaveBeenCalled()
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
        collectionId: dbCollectionMock.id,
        verdict: 'passed',
        rulesVersion: '0.4.0',
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
      mockFindItemsByIds.mockResolvedValue([item])
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

        expect(mockRecordEventOnce).not.toHaveBeenCalled()
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

        expect(mockRecordEventOnce).not.toHaveBeenCalled()
        expect(mockUpdateCuration).not.toHaveBeenCalled()
        expect(mockNotifySlack).not.toHaveBeenCalled()
      })
    })

    describe('and the verdict is passed', () => {
      it('should record the pass with the callback body and notify Slack', async () => {
        await service.handleValidationResult(dbCollectionMock.id, result)

        expect(mockRecordEventOnce).toHaveBeenCalledWith({
          collection_id: dbCollectionMock.id,
          type: CollectionEventType.REVIEW_AI_PASSED,
          actor: CollectionEventActor.VALIDATOR,
          actor_address: null,
          payload: result,
        })
        expect(mockUpdateCuration).not.toHaveBeenCalled()
        expect(mockNotifySlack).toHaveBeenCalledWith(
          expect.stringContaining('ready for a curator approval')
        )
      })

      describe('and an item changed while the validation ran', () => {
        beforeEach(() => {
          mockFindItemsByIds.mockResolvedValue([
            { ...item, local_content_hash: 'editedHash' },
          ])
        })

        it('should record the stale items with the pass and ask for a new review instead', async () => {
          await service.handleValidationResult(dbCollectionMock.id, result)

          expect(mockRecordEventOnce).toHaveBeenCalledWith(
            expect.objectContaining({
              type: CollectionEventType.REVIEW_AI_PASSED,
              payload: { ...result, staleItemIds: [item.id] },
            })
          )
          expect(mockNotifySlack).toHaveBeenCalledWith(
            expect.stringContaining('changed while it ran')
          )
          expect(mockNotifySlack).not.toHaveBeenCalledWith(
            expect.stringContaining('ready for a curator approval')
          )
        })
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
          { id: 'curationId', status: CurationStatus.PENDING }
        )
        expect(mockRecordEventOnce).toHaveBeenCalledWith(
          expect.objectContaining({
            type: CollectionEventType.REVIEW_AI_REJECTED,
            payload: result,
          })
        )
        expect(mockNotifySlack).not.toHaveBeenCalled()
      })

      describe('and a redelivery of the verdict was already recorded', () => {
        beforeEach(() => {
          mockRecordEventOnce.mockResolvedValue(undefined)
        })

        it('should still land the rejection on the pending curation and not notify Slack', async () => {
          await service.handleValidationResult(dbCollectionMock.id, result)

          expect(
            mockUpdateCuration
          ).toHaveBeenCalledWith(
            expect.objectContaining({ status: CurationStatus.REJECTED }),
            { id: 'curationId', status: CurationStatus.PENDING }
          )
          expect(mockNotifySlack).not.toHaveBeenCalled()
        })
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
          expect(mockCreateCuration).not.toHaveBeenCalled()
          expect(mockRecordEventOnce).toHaveBeenCalledTimes(1)
        })
      })

      describe('and a curator decided the collection while it ran', () => {
        beforeEach(() => {
          mockFindLatestEventByType.mockImplementation((_, type) =>
            Promise.resolve(
              type === CollectionEventType.REVIEW_AI_STARTED
                ? {
                    ...buildEvent(CollectionEventType.REVIEW_AI_STARTED, {
                      validationId: 'latestValidation',
                    }),
                    created_at: new Date(Date.now() - 60 * 1000),
                  }
                : type === CollectionEventType.REVIEW_APPROVED
                ? buildEvent(CollectionEventType.REVIEW_APPROVED)
                : undefined
            )
          )
          mockFindLatestCuration.mockResolvedValue(undefined)
        })

        it('should keep the verdict for the timeline and leave the curation alone', async () => {
          await service.handleValidationResult(dbCollectionMock.id, result)

          expect(mockRecordEventOnce).toHaveBeenCalledWith(
            expect.objectContaining({
              type: CollectionEventType.REVIEW_AI_REJECTED,
            })
          )
          expect(mockUpdateCuration).not.toHaveBeenCalled()
          expect(mockCreateCuration).not.toHaveBeenCalled()
        })
      })

      describe('and the collection has no curation at all', () => {
        beforeEach(() => {
          mockFindLatestCuration.mockResolvedValue(undefined)
        })

        it('should open a rejected curation in the name of the validator', async () => {
          await service.handleValidationResult(dbCollectionMock.id, result)

          expect(mockUpdateCuration).not.toHaveBeenCalled()
          expect(mockCreateCuration).toHaveBeenCalledWith(
            expect.objectContaining({
              collection_id: dbCollectionMock.id,
              status: CurationStatus.REJECTED,
              reviewed_by: VALIDATOR_REVIEWER,
              assignee: null,
            })
          )
        })
      })
    })

    describe('and recording a rejection fails after the curation was rejected', () => {
      beforeEach(() => {
        result = { ...result, verdict: 'rejected' }
        mockRecordEventOnce.mockRejectedValueOnce(new Error('db down'))
      })

      it('should already have rejected the curation, so the redelivery only has the event left to write', async () => {
        await expect(
          service.handleValidationResult(dbCollectionMock.id, result)
        ).rejects.toThrow('db down')

        expect(
          mockUpdateCuration
        ).toHaveBeenCalledWith(
          expect.objectContaining({ status: CurationStatus.REJECTED }),
          { id: 'curationId', status: CurationStatus.PENDING }
        )
      })
    })

    describe('and the request was recorded as never sent but reached the validator anyway', () => {
      beforeEach(() => {
        mockFindVerdict.mockResolvedValue(
          buildEvent(CollectionEventType.REVIEW_AI_ERROR, {
            validationId: 'latestValidation',
            reason: 'publish_failed',
          })
        )
      })

      it('should record the real verdict', async () => {
        await service.handleValidationResult(dbCollectionMock.id, result)

        expect(mockRecordEventOnce).toHaveBeenCalledWith(
          expect.objectContaining({
            type: CollectionEventType.REVIEW_AI_PASSED,
          })
        )
      })
    })

    describe('and the auto curation was turned off while it ran', () => {
      beforeEach(() => {
        mockIsFeatureFlagEnabled.mockResolvedValue(false)
        result = { ...result, verdict: 'rejected' }
      })

      it('should only keep the verdict for the timeline', async () => {
        await service.handleValidationResult(dbCollectionMock.id, result)

        expect(mockRecordEventOnce).toHaveBeenCalledWith(
          expect.objectContaining({
            type: CollectionEventType.REVIEW_AI_REJECTED,
            payload: result,
          })
        )
        expect(mockUpdateCuration).not.toHaveBeenCalled()
        expect(mockCreateCuration).not.toHaveBeenCalled()
        expect(mockNotifySlack).not.toHaveBeenCalled()
      })
    })

    describe('and the verdict is a retryable error', () => {
      beforeEach(() => {
        result = { ...result, verdict: 'error', retryable: true }
      })

      it('should record an AI error for the sweep and notify Slack without touching the curation', async () => {
        await service.handleValidationResult(dbCollectionMock.id, result)

        expect(mockRecordEventOnce).toHaveBeenCalledTimes(1)
        expect(mockRecordEventOnce).toHaveBeenCalledWith({
          collection_id: dbCollectionMock.id,
          type: CollectionEventType.REVIEW_AI_ERROR,
          actor: CollectionEventActor.VALIDATOR,
          actor_address: null,
          payload: result,
        })
        expect(mockUpdateCuration).not.toHaveBeenCalled()
        expect(mockNotifySlack).toHaveBeenCalledTimes(1)
      })

      it('should not re-send the validation from the callback', async () => {
        await service.handleValidationResult(dbCollectionMock.id, result)

        expect(mockSendValidation).not.toHaveBeenCalled()
        expect(mockRecordEvent).not.toHaveBeenCalled()
      })
    })

    describe('and the verdict is a non-retryable error without unsupported items', () => {
      beforeEach(() => {
        result = { ...result, verdict: 'error', retryable: false }
      })

      it('should hand the collection to a curator as a validator error', async () => {
        await service.handleValidationResult(dbCollectionMock.id, result)

        expect(mockRecordEventOnce).toHaveBeenCalledTimes(1)
        expect(mockRecordEventOnce).toHaveBeenCalledWith({
          collection_id: dbCollectionMock.id,
          type: CollectionEventType.REVIEW_HUMAN_REQUIRED,
          actor: CollectionEventActor.SYSTEM,
          actor_address: null,
          payload: {
            reason: 'validator_error',
            validationId: 'latestValidation',
            rulesVersion: '0.4.0',
            items: result.items,
          },
        })
        expect(mockUpdateCuration).not.toHaveBeenCalled()
        expect(mockNotifySlack).toHaveBeenCalledTimes(1)
      })
    })

    describe('and the verdict is an unsupported error', () => {
      let unsupportedItemId: string

      beforeEach(() => {
        unsupportedItemId = uuidv4()
        result = {
          ...result,
          verdict: 'error',
          reason: 'unsupported',
          retryable: false,
          items: [
            {
              itemId: item.id,
              contentHash: 'localHash',
              passed: true,
              findings: [],
            },
            {
              itemId: unsupportedItemId,
              contentHash: 'otherHash',
              passed: null,
              findings: [],
              unsupported: true,
            },
          ],
        }
      })

      it('should hand only the unsupported items to a curator instead of recording an error', async () => {
        await service.handleValidationResult(dbCollectionMock.id, result)

        expect(mockRecordEventOnce).toHaveBeenCalledTimes(1)
        expect(mockRecordEventOnce).toHaveBeenCalledWith({
          collection_id: dbCollectionMock.id,
          type: CollectionEventType.REVIEW_HUMAN_REQUIRED,
          actor: CollectionEventActor.SYSTEM,
          actor_address: null,
          payload: {
            reason: 'unsupported_items',
            validationId: 'latestValidation',
            rulesVersion: '0.4.0',
            items: [result.items[1]],
          },
        })
      })

      it('should keep the curation pending and notify the curators with the unsupported items only', async () => {
        await service.handleValidationResult(dbCollectionMock.id, result)

        expect(mockUpdateCuration).not.toHaveBeenCalled()
        expect(mockNotifySlack).toHaveBeenCalledTimes(1)
        const [text] = mockNotifySlack.mock.calls[0]
        expect(text).toContain('cannot check 1 item(s)')
        expect(text).toContain(unsupportedItemId)
        expect(text).not.toContain(item.id)
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
          pages: 4,
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

    const submit = async (previousStatus?: CurationStatus) => {
      const changes = await service.prepareChanges(
        dbCollectionMock.id,
        previousStatus
      )
      if (changes) {
        await service.onChangesSubmitted(changes, ethAddress)
      }
      return changes
    }

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
      await submit(CurationStatus.APPROVED)

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

    describe('and the last run already judged the changed item as it is', () => {
      beforeEach(() => {
        mockFindLatestEventByType.mockImplementation((_, type) =>
          Promise.resolve(
            type === CollectionEventType.REVIEW_AI_STARTED
              ? buildEvent(CollectionEventType.REVIEW_AI_STARTED, {
                  validationId: 'judged',
                  contentHashes: { [changedItem.id]: 'newHash' },
                })
              : undefined
          )
        )
        mockFindVerdict.mockResolvedValue(
          buildEvent(CollectionEventType.REVIEW_AI_REJECTED, {
            validationId: 'judged',
          })
        )
      })

      it('should record the request after a rejection as an appeal, without a new run', async () => {
        await submit(CurationStatus.REJECTED)

        expect(mockRecordEvent).toHaveBeenCalledTimes(1)
        expect(mockRecordEvent).toHaveBeenCalledWith({
          collection_id: dbCollectionMock.id,
          type: CollectionEventType.REVIEW_APPEAL_REQUESTED,
          actor: CollectionEventActor.CREATOR,
          actor_address: ethAddress.toLowerCase(),
          payload: { note: '' },
        })
        expect(mockSendValidation).not.toHaveBeenCalled()
      })

      it('should not refuse it at the daily limit: an appeal does not run the validator', async () => {
        mockFindEventsSince.mockResolvedValue([
          buildEvent(CollectionEventType.REVIEW_AI_STARTED, {
            trigger: 'retry',
          }),
          buildEvent(CollectionEventType.REVIEW_AI_STARTED, {
            trigger: 'retry',
          }),
          buildEvent(CollectionEventType.REVIEW_AI_STARTED, {
            trigger: 'publish',
          }),
        ])

        await expect(submit(CurationStatus.REJECTED)).resolves.toEqual(
          expect.objectContaining({ items: [] })
        )
      })
    })

    describe('and a validation is in progress', () => {
      beforeEach(() => {
        mockFindLatestEventByType.mockImplementation((_, type) =>
          Promise.resolve(
            type === CollectionEventType.REVIEW_AI_STARTED
              ? buildEvent(CollectionEventType.REVIEW_AI_STARTED, {
                  validationId: 'running',
                })
              : undefined
          )
        )
        mockFindVerdict.mockResolvedValue(undefined)
      })

      it('should refuse the request before anything is recorded', async () => {
        await expect(submit(CurationStatus.APPROVED)).rejects.toThrow(
          ValidationInProgressError
        )
        expect(mockRecordEvent).not.toHaveBeenCalled()
        expect(mockSendValidation).not.toHaveBeenCalled()
      })
    })

    describe('and the daily limit was reached', () => {
      beforeEach(() => {
        jest.useFakeTimers().setSystemTime(new Date('2026-09-29T15:00:00.000Z'))
        mockFindEventsSince.mockResolvedValue([
          buildEvent(CollectionEventType.REVIEW_AI_STARTED, {
            trigger: 'retry',
          }),
          buildEvent(CollectionEventType.REVIEW_AI_STARTED, {
            trigger: 'retry',
          }),
          buildEvent(CollectionEventType.REVIEW_AI_STARTED, {
            trigger: 'publish',
          }),
        ])
      })

      it('should refuse the request with the time to retry', async () => {
        await expect(submit(CurationStatus.APPROVED)).rejects.toEqual(
          expect.objectContaining({
            retryAt: new Date('2026-09-30T00:00:00.000Z'),
          })
        )
        expect(mockRecordEvent).not.toHaveBeenCalled()
      })
    })

    describe('and the graph is down', () => {
      beforeEach(() => {
        mockFetchRemoteItems.mockRejectedValue(new Error('subgraph down'))
      })

      it('should still validate the items the last run did not judge as they are', async () => {
        await submit(CurationStatus.APPROVED)

        expect(mockSendValidation).toHaveBeenCalledWith(
          expect.objectContaining({
            items: [
              expect.objectContaining({ itemId: unchangedItem.id }),
              expect.objectContaining({ itemId: changedItem.id }),
            ],
          })
        )
      })
    })

    describe('and a changed item has no stored hash', () => {
      beforeEach(() => {
        mockFindItemsByCollection.mockResolvedValue([
          { ...changedItem, local_content_hash: null },
        ])
      })

      it('should hash it and validate it with that hash', async () => {
        await submit(CurationStatus.APPROVED)

        expect(mockCalculateHash).toHaveBeenCalledTimes(1)
        expect(mockSendValidation).toHaveBeenCalledWith(
          expect.objectContaining({
            items: [
              expect.objectContaining({
                itemId: changedItem.id,
                contentHash: 'computedHash',
              }),
            ],
          })
        )
      })
    })

    describe('and the flag is off', () => {
      beforeEach(() => {
        mockIsFeatureFlagEnabled.mockResolvedValue(false)
      })

      it('should not even load the collection', async () => {
        await expect(submit(CurationStatus.APPROVED)).resolves.toBeNull()

        expect(mockFindCollection).not.toHaveBeenCalled()
        expect(mockRecordEvent).not.toHaveBeenCalled()
      })
    })

    describe('and recording the start fails after the request was stored', () => {
      beforeEach(() => {
        mockRecordEvent.mockRejectedValueOnce(new Error('db down'))
      })

      it('should resolve without throwing', async () => {
        const changes = await service.prepareChanges(
          dbCollectionMock.id,
          CurationStatus.APPROVED
        )
        await expect(
          service.onChangesSubmitted(changes!, ethAddress)
        ).resolves.toBeUndefined()
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
      mockFindLatestEventByType.mockResolvedValue(staleStart)
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

      it('should look for starts older than two hours within the last week', async () => {
        jest.useFakeTimers().setSystemTime(new Date('2026-09-29T15:00:00.000Z'))

        await service.sweepStaleValidations()

        expect(STALE_VALIDATION_MS).toBe(2 * 60 * 60 * 1000)
        expect(mockFindStaleAiStarted).toHaveBeenCalledWith(
          new Date('2026-09-29T13:00:00.000Z'),
          new Date(Date.now() - SWEEP_LOOKBACK_MS)
        )
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
              contentHashes: { [item.id]: 'localHash' },
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
          expect(mockRecordEventOnce).not.toHaveBeenCalled()
          expect(mockNotifySlack).not.toHaveBeenCalled()
        })
      })

      describe('and the collection reached the re-send cap', () => {
        beforeEach(() => {
          mockCountSweepStarts.mockResolvedValue(MAX_SWEEP_RESENDS)
        })

        it('should record an exhausted error, alert Slack and stop re-sending', async () => {
          await service.sweepStaleValidations()

          expect(mockRecordEvent).not.toHaveBeenCalled()
          expect(mockRecordEventOnce).toHaveBeenCalledWith({
            collection_id: dbCollectionMock.id,
            type: CollectionEventType.REVIEW_AI_ERROR,
            actor: CollectionEventActor.VALIDATOR,
            actor_address: null,
            payload: { reason: 'sweep_exhausted', validationId: 'lost' },
          })
          expect(mockNotifySlack).toHaveBeenCalledTimes(1)
          expect(mockSendValidation).not.toHaveBeenCalled()
        })

        it('should give up after three re-sends', () => {
          expect(MAX_SWEEP_RESENDS).toBe(3)
        })

        describe('and the stale start already has a retryable error', () => {
          beforeEach(() => {
            mockFindVerdict.mockResolvedValue(
              buildEvent(CollectionEventType.REVIEW_AI_ERROR, {
                validationId: 'lost',
                verdict: 'error',
                retryable: true,
              })
            )
          })

          it('should still record the exhausted error under the same validation id', async () => {
            await service.sweepStaleValidations()

            expect(mockRecordEventOnce).toHaveBeenCalledWith(
              expect.objectContaining({
                type: CollectionEventType.REVIEW_AI_ERROR,
                payload: { reason: 'sweep_exhausted', validationId: 'lost' },
              })
            )
            expect(mockNotifySlack).toHaveBeenCalledTimes(1)
          })
        })

        describe('and the exhausted error was already recorded', () => {
          beforeEach(() => {
            mockRecordEventOnce.mockResolvedValue(undefined)
          })

          it('should not alert Slack again', async () => {
            await service.sweepStaleValidations()

            expect(mockNotifySlack).not.toHaveBeenCalled()
            expect(mockSendValidation).not.toHaveBeenCalled()
          })
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

    describe('and the flag is off', () => {
      beforeEach(() => {
        mockIsFeatureFlagEnabled.mockResolvedValue(false)
      })

      it('should not record anything nor request anything', async () => {
        await service.onStandardCollectionPublished(
          dbCollectionMock,
          ethAddress
        )
        expect(mockRecordEvent).not.toHaveBeenCalled()
        expect(mockSendValidation).not.toHaveBeenCalled()
      })
    })

    describe('and the topic is not configured', () => {
      beforeEach(() => {
        delete process.env.AWS_SNS_ARN
      })

      afterEach(() => {
        process.env.AWS_SNS_ARN = 'arn:aws:sns:us-east-1:000000000000:events'
      })

      it('should not request anything', async () => {
        await service.onStandardCollectionPublished(
          dbCollectionMock,
          ethAddress
        )
        expect(mockRecordEvent).not.toHaveBeenCalled()
        expect(mockSendValidation).not.toHaveBeenCalled()
      })
    })

    describe('and the collection is a third party collection', () => {
      it('should not request anything', async () => {
        await service.onStandardCollectionPublished(
          dbTPCollectionMock,
          ethAddress
        )
        expect(mockRecordEvent).not.toHaveBeenCalled()
        expect(mockSendValidation).not.toHaveBeenCalled()
      })
    })

    describe('and its review already started', () => {
      beforeEach(() => {
        mockFindLatestEventByType.mockImplementation((_, type) =>
          Promise.resolve(
            type === CollectionEventType.REVIEW_AI_STARTED
              ? buildEvent(CollectionEventType.REVIEW_AI_STARTED)
              : undefined
          )
        )
      })

      it('should not open another review', async () => {
        await service.onStandardCollectionPublished(
          dbCollectionMock,
          ethAddress
        )
        expect(mockCreateCuration).not.toHaveBeenCalled()
        expect(mockRecordEvent).not.toHaveBeenCalled()
        expect(mockSendValidation).not.toHaveBeenCalled()
      })
    })

    describe('and the publication was recorded but its review never started', () => {
      beforeEach(() => {
        mockFindLatestEventByType.mockImplementation((_, type) =>
          Promise.resolve(
            type === CollectionEventType.COLLECTION_PUBLISHED
              ? buildEvent(CollectionEventType.COLLECTION_PUBLISHED)
              : undefined
          )
        )
      })

      it('should start the review without recording the publication twice', async () => {
        await service.onStandardCollectionPublished(
          dbCollectionMock,
          ethAddress
        )
        expect(mockRecordEvent).toHaveBeenCalledTimes(1)
        expect(mockRecordEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            type: CollectionEventType.REVIEW_AI_STARTED,
          })
        )
        expect(mockSendValidation).toHaveBeenCalledTimes(1)
      })
    })

    describe('and the validation request is too large to publish', () => {
      beforeEach(() => {
        jest.spyOn(console, 'error').mockImplementation(() => undefined)
        mockSendValidation.mockRejectedValue(
          new ValidationTooLargeError(300000, 1)
        )
      })

      it('should record a final too large error, log the size and alert Slack', async () => {
        await service.onStandardCollectionPublished(
          dbCollectionMock,
          ethAddress
        )

        const start = mockRecordEvent.mock.calls
          .map(([event]) => event)
          .find((event) => event.type === CollectionEventType.REVIEW_AI_STARTED)
        expect(mockRecordEventOnce).toHaveBeenCalledWith({
          collection_id: dbCollectionMock.id,
          type: CollectionEventType.REVIEW_AI_ERROR,
          actor: CollectionEventActor.SYSTEM,
          actor_address: null,
          payload: {
            reason: 'too_large',
            validationId: start.payload.validationId,
            bytes: 300000,
            itemCount: 1,
          },
        })
        expect(mockNotifyNotRequested).toHaveBeenCalledWith(
          dbCollectionMock.id,
          expect.stringContaining('too large')
        )
      })
    })

    describe('and publishing the validation request fails', () => {
      beforeEach(() => {
        mockSendValidation.mockRejectedValue(new Error('SNS is down'))
      })

      it('should record a retryable error so the sweep re-sends it and a retry is not blocked', async () => {
        await expect(
          service.onStandardCollectionPublished(dbCollectionMock, ethAddress)
        ).resolves.toBeUndefined()

        const start = mockRecordEvent.mock.calls
          .map(([event]) => event)
          .find((event) => event.type === CollectionEventType.REVIEW_AI_STARTED)
        expect(mockRecordEventOnce).toHaveBeenCalledWith({
          collection_id: dbCollectionMock.id,
          type: CollectionEventType.REVIEW_AI_ERROR,
          actor: CollectionEventActor.SYSTEM,
          actor_address: null,
          payload: {
            reason: 'publish_failed',
            validationId: start.payload.validationId,
          },
        })
        expect(mockNotifySlack).not.toHaveBeenCalled()
      })
    })

    it('should record the publication with an empty payload and start the validation without opening a curation', async () => {
      await service.onStandardCollectionPublished(dbCollectionMock, ethAddress)

      expect(mockCreateCuration).not.toHaveBeenCalled()
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
          payload: expect.objectContaining({
            trigger: 'publish',
            itemIds: [item.id],
            contentHashes: { [item.id]: 'localHash' },
          }),
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
