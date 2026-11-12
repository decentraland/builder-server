import supertest from 'supertest'
import { v4 as uuidv4 } from 'uuid'
import {
  buildURL,
  createAuthHeaders,
  mockExistsMiddleware,
} from '../../spec/utils'
import { wallet } from '../../spec/mocks/wallet'
import {
  dbCollectionMock,
  dbTPCollectionMock,
} from '../../spec/mocks/collections'
import { app } from '../server'
import { Collection } from '../Collection/Collection.model'
import { isCommitteeMember } from '../Committee'
import { isFeatureFlagEnabled } from '../utils/features'
import { CollectionCuration } from './CollectionCuration'
import { ItemCuration } from './ItemCuration'
import { curationNotifications } from './notifications'
import {
  CollectionEvent,
  CollectionEventActor,
  CollectionEventAttributes,
  CollectionEventType,
} from './CollectionEvent'
import { CurationStatus } from './Curation.types'
import { Item } from '../Item/Item.model'
import { withCollectionLock } from './collectionLock'
import { CollectionBusyError } from './AutoCuration.errors'
import { MAX_VALIDATION_ATTEMPTS_PER_DAY } from './AutoCuration.types'
import { requestValidation as sendValidation } from './validationQueue'
import {
  SIGNATURE_HEADER,
  signValidatorPayload,
  TIMESTAMP_HEADER,
} from './AutoCuration.router'

jest.mock('../ethereum/api/collection')
jest.mock('../ethereum/api/peer')
jest.mock('../utils/eth')
jest.mock('../utils/features')
jest.mock('../Forum/client')
jest.mock('../SlotUsageCheque')
jest.mock('./ItemCuration')
jest.mock('./CollectionCuration')
jest.mock('../ThirdParty/ThirdParty.service')
jest.mock('../Committee')
jest.mock('../Item/Item.model')
jest.mock('../Collection/Collection.model')
jest.mock('../warehouse')
jest.mock('./CollectionEvent/CollectionEvent.model')
jest.mock('./validationQueue', () => ({
  ...jest.requireActual('./validationQueue'),
  requestValidation: jest.fn(),
}))
jest.mock('./slack', () => ({
  ...jest.requireActual('./slack'),
  notifyCurationSlack: jest.fn(),
}))
jest.mock('./notifications')
jest.mock('./collectionLock')

const server = supertest(app.getApp())
const callbackSecret = 'local-secret-example123'

const mockIsCommitteeMember = isCommitteeMember as jest.Mock
const mockIsFeatureFlagEnabled = isFeatureFlagEnabled as jest.Mock
const mockFindVerdict = CollectionEvent.findVerdictByValidationId as jest.Mock
const mockRecordEventOnce = CollectionEvent.recordOnce as jest.Mock
const mockRecordEvent = CollectionEvent.record as jest.Mock
const mockFindLatestEvent = CollectionEvent.findLatestByCollectionId as jest.Mock
const mockFindLatestEventByType = CollectionEvent.findLatestByCollectionIdAndType as jest.Mock
const mockFindEventsSince = CollectionEvent.findByCollectionIdSince as jest.Mock
const mockFindEventsPage = CollectionEvent.findPageByCollectionId as jest.Mock
const mockFindLatestCuration = CollectionCuration.findLatestByCollectionId as jest.Mock

function postSigned(
  path: string,
  body: unknown,
  {
    secret = callbackSecret,
    timestamp = String(Date.now()),
    contentType = 'application/json',
  } = {}
) {
  const rawBody = JSON.stringify(body)
  return server
    .post(buildURL(path))
    .set('Content-Type', contentType)
    .set(TIMESTAMP_HEADER, timestamp)
    .set(SIGNATURE_HEADER, signValidatorPayload(secret, timestamp, rawBody))
    .send(rawBody)
}

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

describe('AutoCuration router', () => {
  let url: string

  beforeAll(() => {
    process.env.WEARABLE_VALIDATOR_CALLBACK_SECRET = callbackSecret
    process.env.AWS_SNS_ARN = 'arn:aws:sns:us-east-1:000000000000:events'
  })

  afterAll(() => {
    delete process.env.WEARABLE_VALIDATOR_CALLBACK_SECRET
    delete process.env.AWS_SNS_ARN
  })

  beforeEach(() => {
    mockIsFeatureFlagEnabled.mockResolvedValue(true)
    ;(Item.findByIds as jest.Mock).mockResolvedValue([])
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
    ;(withCollectionLock as jest.Mock).mockImplementation(
      (_: string, task: () => Promise<unknown>) => task()
    )
  })

  afterEach(() => {
    jest.resetAllMocks()
    jest.restoreAllMocks()
  })

  describe('when the auto curation flag is off', () => {
    beforeEach(() => {
      mockIsFeatureFlagEnabled.mockResolvedValue(false)
      ;(Collection.findOne as jest.Mock).mockResolvedValue(dbCollectionMock)
    })

    it('should answer 404 on the validation request', () => {
      url = `/collections/${dbCollectionMock.id}/validations`
      return server
        .post(buildURL(url))
        .set(createAuthHeaders('post', url))
        .expect(404)
        .then(() => expect(CollectionCuration.create).not.toHaveBeenCalled())
    })

    it('should answer 404 on the appeal', () => {
      url = `/collections/${dbCollectionMock.id}/curation/appeal`
      return server
        .post(buildURL(url))
        .set(createAuthHeaders('post', url))
        .send({ note: 'Please' })
        .expect(404)
        .then(() => expect(CollectionCuration.create).not.toHaveBeenCalled())
    })

    it('should answer 404 on a comment', () => {
      url = `/collections/${dbCollectionMock.id}/comments`
      return server
        .post(buildURL(url))
        .set(createAuthHeaders('post', url))
        .send({ message: 'Hello' })
        .expect(404)
    })

    it('should answer 404 on the events', () => {
      url = `/collections/${dbCollectionMock.id}/events`
      return server
        .get(buildURL(url))
        .set(createAuthHeaders('get', url))
        .expect(404)
    })

    it('should still record a signed validator callback for a job that was in flight', () => {
      url = `/collections/${dbCollectionMock.id}/validation-result`
      mockFindLatestEventByType.mockResolvedValue(
        buildEvent(CollectionEventType.REVIEW_AUTOMATED_STARTED, {
          validationId: 'inFlight',
        })
      )
      mockRecordEventOnce.mockImplementation((event) => Promise.resolve(event))
      return postSigned(url, {
        validationId: 'inFlight',
        collectionId: dbCollectionMock.id,
        verdict: 'passed',
        rulesVersion: '0.4.0',
        items: [],
      })
        .expect(204)
        .then(() =>
          expect(mockRecordEventOnce).toHaveBeenCalledWith(
            expect.objectContaining({
              type: CollectionEventType.REVIEW_AUTOMATED_PASSED,
            })
          )
        )
    })

    it('should answer 401 on an unsigned validator callback', () => {
      url = `/collections/${dbCollectionMock.id}/validation-result`
      return server
        .post(buildURL(url))
        .send({ validationId: 'x', verdict: 'passed', items: [] })
        .expect(401)
        .then(() => expect(mockFindLatestEventByType).not.toHaveBeenCalled())
    })
  })

  describe('when receiving a validation result', () => {
    let result: Record<string, unknown>

    beforeEach(() => {
      result = {
        validationId: 'latestValidation',
        collectionId: dbCollectionMock.id,
        verdict: 'passed',
        rulesVersion: '0.4.0',
        items: [
          {
            itemId: uuidv4(),
            contentHash: 'aHash',
            passed: true,
            findings: [],
          },
        ],
      }
      url = `/collections/${dbCollectionMock.id}/validation-result`
      mockExistsMiddleware(Collection, dbCollectionMock.id)
      ;(Collection.findOne as jest.Mock).mockResolvedValue(dbCollectionMock)
      mockFindLatestEventByType.mockResolvedValue(
        buildEvent(CollectionEventType.REVIEW_AUTOMATED_STARTED, {
          validationId: 'latestValidation',
        })
      )
      mockFindLatestCuration.mockResolvedValue({
        id: 'curationId',
        status: CurationStatus.PENDING,
      })
      mockRecordEventOnce.mockImplementation((event) => Promise.resolve(event))
    })

    describe('and the request is not signed', () => {
      it('should respond with a 401 without touching the events', () => {
        return server
          .post(buildURL(url))
          .send(result)
          .expect(401)
          .then(() => {
            expect(mockFindLatestEventByType).not.toHaveBeenCalled()
            expect(mockRecordEventOnce).not.toHaveBeenCalled()
          })
      })
    })

    describe('and the signature was made with another secret', () => {
      it('should respond with a 401 without touching the events', () => {
        return postSigned(url, result, { secret: 'another-secret-example123' })
          .expect(401)
          .then(() => {
            expect(mockRecordEventOnce).not.toHaveBeenCalled()
          })
      })
    })

    describe('and the body was changed after signing', () => {
      it('should respond with a 401', () => {
        const timestamp = String(Date.now())
        return server
          .post(buildURL(url))
          .set('Content-Type', 'application/json')
          .set(TIMESTAMP_HEADER, timestamp)
          .set(
            SIGNATURE_HEADER,
            signValidatorPayload(
              callbackSecret,
              timestamp,
              JSON.stringify(result)
            )
          )
          .send(JSON.stringify({ ...result, verdict: 'rejected' }))
          .expect(401)
          .then(() => {
            expect(mockRecordEventOnce).not.toHaveBeenCalled()
          })
      })
    })

    describe('and the timestamp is more than five minutes old', () => {
      it('should respond with a 401', () => {
        return postSigned(url, result, {
          timestamp: String(Date.now() - 6 * 60 * 1000),
        })
          .expect(401)
          .then(() => {
            expect(mockRecordEventOnce).not.toHaveBeenCalled()
          })
      })
    })

    describe('and the body is not JSON so there is no raw body', () => {
      it('should respond with a 401', () => {
        return postSigned(url, result, { contentType: 'text/plain' })
          .expect(401)
          .then(() => {
            expect(mockRecordEventOnce).not.toHaveBeenCalled()
          })
      })
    })

    describe('and the secret is not configured', () => {
      beforeEach(() => {
        delete process.env.WEARABLE_VALIDATOR_CALLBACK_SECRET
      })

      afterEach(() => {
        process.env.WEARABLE_VALIDATOR_CALLBACK_SECRET = callbackSecret
      })

      it('should respond with a 401', () => {
        return postSigned(url, result).expect(401)
      })
    })

    describe('and the body is invalid', () => {
      it('should respond with a 400', () => {
        return postSigned(url, {
          validationId: 'latestValidation',
          verdict: 'maybe',
        })
          .expect(400)
          .then(() => {
            expect(mockRecordEventOnce).not.toHaveBeenCalled()
          })
      })
    })

    describe('and the body has an unknown top level field', () => {
      it('should drop the field from the recorded result', () => {
        return postSigned(url, { ...result, unexpected: true })
          .expect(204)
          .then(() => {
            expect(mockRecordEventOnce).toHaveBeenCalledWith(
              expect.objectContaining({ payload: result })
            )
          })
      })
    })

    describe('and the body is for another collection', () => {
      it('should respond with a 400 without touching the events', () => {
        return postSigned(url, { ...result, collectionId: uuidv4() })
          .expect(400)
          .then(() => {
            expect(mockFindLatestEventByType).not.toHaveBeenCalled()
            expect(mockRecordEventOnce).not.toHaveBeenCalled()
          })
      })
    })

    describe('and the rules version carries build metadata', () => {
      it('should accept it', () => {
        return postSigned(url, { ...result, rulesVersion: '0.5.0+abc.1' })
          .expect(204)
          .then(() => expect(mockRecordEventOnce).toHaveBeenCalled())
      })
    })

    describe('and a logged id carries a line break', () => {
      it('should respond with a 400', () => {
        return postSigned(url, {
          ...result,
          validationId: 'latest\nValidation',
        })
          .expect(400)
          .then(() => expect(mockRecordEventOnce).not.toHaveBeenCalled())
      })
    })

    describe('and the collection does not exist any more', () => {
      beforeEach(() => {
        ;(Collection.findOne as jest.Mock).mockResolvedValue(undefined)
        mockFindLatestEventByType.mockResolvedValue(undefined)
      })

      it('should still respond with a 204 so the job does not retry it', () => {
        return postSigned(url, result)
          .expect(204)
          .then(() => expect(mockRecordEventOnce).not.toHaveBeenCalled())
      })
    })

    describe('and the validation is not the latest one', () => {
      it('should respond with a 204 and ignore it', () => {
        return postSigned(url, { ...result, validationId: 'staleValidation' })
          .expect(204)
          .then(() => {
            expect(mockRecordEventOnce).not.toHaveBeenCalled()
            expect(CollectionCuration.update).not.toHaveBeenCalled()
          })
      })
    })

    describe('and the validation is the latest one', () => {
      it('should respond with a 204 and record the verdict', () => {
        return postSigned(url, result)
          .expect(204)
          .then(() => {
            expect(mockRecordEventOnce).toHaveBeenCalledWith(
              expect.objectContaining({
                type: CollectionEventType.REVIEW_AUTOMATED_PASSED,
                payload: result,
              })
            )
          })
      })

      describe('and the result carries every field the validator job sends', () => {
        beforeEach(() => {
          result = {
            ...result,
            verdict: 'error',
            retryable: true,
            items: [
              {
                itemId: uuidv4(),
                contentHash: 'aHash',
                passed: false,
                findings: [
                  {
                    rule: 'S-05',
                    check: 'file-size',
                    severity: 'error',
                    message: 'The item is too big',
                    where: 'male/shirt.glb',
                    bodyShape: 'male',
                    measured: 4228654,
                    limit: 3145728,
                    fix: 'Reduce the textures',
                    docs: 'https://docs.example.com/s-05',
                  },
                ],
                visualSummary: 'thumbnail-honesty: Looks fine',
              },
              {
                itemId: uuidv4(),
                contentHash: 'bHash',
                passed: null,
                findings: [],
                error: 'The render server did not answer',
              },
              {
                itemId: uuidv4(),
                contentHash: 'cHash',
                passed: null,
                findings: [],
                unsupported: true,
              },
            ],
          }
        })

        it('should accept it and record the whole result', () => {
          return postSigned(url, result)
            .expect(204)
            .then(() => {
              expect(mockRecordEventOnce).toHaveBeenCalledWith(
                expect.objectContaining({
                  type: CollectionEventType.REVIEW_AUTOMATED_ERROR,
                  payload: result,
                })
              )
            })
        })
      })

      describe('and the verdict is an unsupported error', () => {
        it('should hand the collection to a curator', () => {
          return postSigned(url, {
            ...result,
            verdict: 'error',
            reason: 'unsupported',
            retryable: false,
          })
            .expect(204)
            .then(() => {
              expect(mockRecordEventOnce).toHaveBeenCalledWith(
                expect.objectContaining({
                  type: CollectionEventType.REVIEW_HUMAN_REQUIRED,
                  payload: expect.objectContaining({
                    reason: 'unsupported_items',
                    validationId: 'latestValidation',
                  }),
                })
              )
              expect(CollectionCuration.update).not.toHaveBeenCalled()
            })
        })
      })

      describe('and the verdict is rejected', () => {
        it('should reject the curation on behalf of the validator', () => {
          return postSigned(url, { ...result, verdict: 'rejected' })
            .expect(204)
            .then(() => {
              expect(CollectionCuration.update).toHaveBeenCalledWith(
                expect.objectContaining({
                  status: CurationStatus.REJECTED,
                  reviewed_by: 'validator',
                }),
                { id: 'curationId', status: CurationStatus.PENDING }
              )
            })
        })
      })
    })
  })

  describe('when getting the events of a collection', () => {
    let aiEvent: CollectionEventAttributes

    beforeEach(() => {
      url = `/collections/${dbCollectionMock.id}/events`
      mockExistsMiddleware(Collection, dbCollectionMock.id)
      aiEvent = buildEvent(CollectionEventType.REVIEW_AUTOMATED_PASSED, {
        validationId: 'secret',
        verdict: 'passed',
        items: [],
      })
      mockFindEventsPage.mockResolvedValue([{ ...aiEvent, total_count: '1' }])
    })

    describe('and the caller is neither on the committee nor manages the collection', () => {
      beforeEach(() => {
        mockIsCommitteeMember.mockResolvedValue(false)
        ;(Collection.findOne as jest.Mock).mockResolvedValue(undefined)
      })

      it('should respond with a 401', () => {
        return server
          .get(buildURL(url))
          .set(createAuthHeaders('get', url))
          .expect(401)
          .then(() => {
            expect(mockFindEventsPage).not.toHaveBeenCalled()
          })
      })
    })

    describe('and the caller owns the collection but is not on the committee', () => {
      beforeEach(() => {
        mockIsCommitteeMember.mockResolvedValue(false)
        ;(Collection.findOne as jest.Mock).mockResolvedValue({
          ...dbCollectionMock,
          eth_address: wallet.address,
        })
      })

      it('should respond with the page without the validation ids', () => {
        return server
          .get(buildURL(url, { page: '1', limit: '10' }))
          .set(createAuthHeaders('get', url))
          .expect(200)
          .then((response: any) => {
            expect(mockFindEventsPage).toHaveBeenCalledWith(
              dbCollectionMock.id,
              10,
              0
            )
            expect(response.body).toEqual({
              ok: true,
              data: {
                results: [
                  expect.objectContaining({
                    id: aiEvent.id,
                    type: CollectionEventType.REVIEW_AUTOMATED_PASSED,
                    payload: { verdict: 'passed', items: [] },
                  }),
                ],
                total: 1,
                pages: 1,
                page: 1,
                limit: 10,
              },
            })
          })
      })
    })

    describe('and the caller is on the committee', () => {
      beforeEach(() => {
        mockIsCommitteeMember.mockResolvedValue(true)
      })

      it('should respond with the page including the validation ids', () => {
        return server
          .get(buildURL(url))
          .set(createAuthHeaders('get', url))
          .expect(200)
          .then((response: any) => {
            expect(response.body.data.results[0].payload.validationId).toBe(
              'secret'
            )
            expect(response.body.data.limit).toBe(50)
          })
      })
    })
  })

  describe('when requesting a validation', () => {
    beforeEach(() => {
      url = `/collections/${dbCollectionMock.id}/validations`
      mockExistsMiddleware(Collection, dbCollectionMock.id)
      ;(Collection.findOne as jest.Mock).mockResolvedValue({
        ...dbCollectionMock,
        eth_address: wallet.address,
      })
      mockFindEventsSince.mockResolvedValue([])
    })

    describe('and a validation is in progress', () => {
      beforeEach(() => {
        mockFindLatestEventByType.mockResolvedValue(
          buildEvent(CollectionEventType.REVIEW_AUTOMATED_STARTED, {
            validationId: 'running',
          })
        )
        mockFindVerdict.mockResolvedValue(undefined)
      })

      it('should respond with a 409', () => {
        return server
          .post(buildURL(url))
          .set(createAuthHeaders('post', url))
          .expect(409)
          .then((response: any) => {
            expect(response.body).toEqual({
              ok: false,
              data: { id: dbCollectionMock.id },
              error: 'A validation is already in progress for this collection',
            })
            expect(sendValidation).not.toHaveBeenCalled()
          })
      })
    })

    describe('and the daily limit was reached', () => {
      beforeEach(() => {
        mockFindLatestEventByType.mockResolvedValue(undefined)
        mockFindEventsSince.mockResolvedValue([
          ...Array.from({ length: MAX_VALIDATION_ATTEMPTS_PER_DAY - 1 }, () =>
            buildEvent(CollectionEventType.REVIEW_AUTOMATED_STARTED, {
              trigger: 'retry',
            })
          ),
          buildEvent(CollectionEventType.REVIEW_AUTOMATED_STARTED, {
            trigger: 'publish',
          }),
        ])
      })

      it('should respond with a 429 and the time to retry', () => {
        return server
          .post(buildURL(url))
          .set(createAuthHeaders('post', url))
          .expect(429)
          .then((response: any) => {
            expect(response.body.data).toEqual({
              id: dbCollectionMock.id,
              retryAt: expect.stringMatching(/T00:00:00\.000Z$/),
            })

            expect(sendValidation).not.toHaveBeenCalled()
          })
      })
    })

    describe('and nothing changed since the latest verdict', () => {
      beforeEach(() => {
        ;(CollectionEvent.findJudgedStartsByCollectionId as jest.Mock).mockImplementation(
          async (collectionId: string) => [
            await mockFindLatestEventByType(
              collectionId,
              CollectionEventType.REVIEW_AUTOMATED_STARTED
            ),
          ]
        )
        const itemId = uuidv4()
        mockFindLatestEventByType.mockImplementation((_, type) =>
          Promise.resolve(
            type === CollectionEventType.REVIEW_AUTOMATED_STARTED
              ? {
                  ...buildEvent(CollectionEventType.REVIEW_AUTOMATED_STARTED, {
                    validationId: 'previous',
                    itemIds: [itemId],
                    contentHashes: { [itemId]: 'sameHash' },
                  }),
                  created_at: new Date(Date.now() - 60 * 1000),
                }
              : undefined
          )
        )
        mockFindVerdict.mockResolvedValue(
          buildEvent(CollectionEventType.REVIEW_AUTOMATED_REJECTED, {
            validationId: 'previous',
          })
        )
        const item = { id: itemId, local_content_hash: 'sameHash' }
        ;(Item.findByIds as jest.Mock).mockResolvedValue([item])
        ;(Item.findOrderedByCollectionId as jest.Mock).mockResolvedValue([item])
      })

      it('should respond with a 409 asking for a change or an appeal', () => {
        return server
          .post(buildURL(url))
          .set(createAuthHeaders('post', url))
          .expect(409)
          .then((response: any) => {
            expect(response.body.error).toBe(
              'Nothing changed since the last validation: edit an item or appeal the decision'
            )
            expect(sendValidation).not.toHaveBeenCalled()
          })
      })
    })

    describe('and another instance is updating the collection', () => {
      beforeEach(() => {
        const mockWithCollectionLock = withCollectionLock as jest.Mock
        mockWithCollectionLock.mockRejectedValueOnce(
          new CollectionBusyError(dbCollectionMock.id)
        )
      })

      it('should respond with a 503 so the caller retries', () => {
        return server
          .post(buildURL(url))
          .set(createAuthHeaders('post', url))
          .expect(503)
          .then(() => {
            expect(sendValidation).not.toHaveBeenCalled()
          })
      })
    })
  })

  describe('when appealing a rejection', () => {
    beforeEach(() => {
      url = `/collections/${dbCollectionMock.id}/curation/appeal`
      mockExistsMiddleware(Collection, dbCollectionMock.id)
      ;(Collection.findOne as jest.Mock).mockResolvedValue({
        ...dbCollectionMock,
        eth_address: wallet.address,
      })
    })

    describe('and the note is missing', () => {
      beforeEach(() => {
        mockFindLatestEvent.mockResolvedValue(
          buildEvent(CollectionEventType.REVIEW_AUTOMATED_REJECTED)
        )
        mockFindLatestCuration.mockResolvedValue({
          id: 'curationId',
          status: CurationStatus.REJECTED,
        })
        ;(CollectionCuration.create as jest.Mock).mockImplementation(
          (curation) => Promise.resolve(curation)
        )
      })

      it('should open the pending curation anyway and respond with it', () => {
        return server
          .post(buildURL(url))
          .set(createAuthHeaders('post', url))
          .send({})
          .expect(200)
          .then((response: any) => {
            expect(response.body.data).toEqual(
              expect.objectContaining({ status: CurationStatus.PENDING })
            )
            expect(mockRecordEvent).toHaveBeenCalledWith(
              expect.objectContaining({
                type: CollectionEventType.REVIEW_APPEAL_REQUESTED,
                payload: { note: '' },
              })
            )
          })
      })
    })

    describe('and the note is longer than 2000 characters', () => {
      it('should respond with a 400', () => {
        return server
          .post(buildURL(url))
          .set(createAuthHeaders('post', url))
          .send({ note: 'a'.repeat(2001) })
          .expect(400)
      })
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

      it('should respond with a 409', () => {
        return server
          .post(buildURL(url))
          .set(createAuthHeaders('post', url))
          .send({ note: 'Please look again' })
          .expect(409)
          .then((response: any) => {
            expect(response.body.error).toBe(
              'There is already an open appeal for this collection'
            )
            expect(CollectionCuration.create).not.toHaveBeenCalled()
          })
      })
    })
  })

  describe('when commenting on the review of a collection', () => {
    const mockHasPublishedItems = Item.hasPublishedItems as jest.Mock
    const mockFindItem = Item.findOne as jest.Mock
    const mockCommentPosted = curationNotifications.commentPosted as jest.Mock
    const mockFindCollection = Collection.findOne as jest.Mock
    const mockFindLastItemCuration = ItemCuration.findLastByCollectionId as jest.Mock

    const post = (body: unknown) =>
      server
        .post(buildURL(url))
        .set(createAuthHeaders('post', url))
        .send(body as object)

    beforeEach(() => {
      url = `/collections/${dbCollectionMock.id}/comments`
      mockExistsMiddleware(Collection, dbCollectionMock.id)
      mockIsCommitteeMember.mockResolvedValue(false)
      mockFindCollection.mockResolvedValue({
        ...dbCollectionMock,
        eth_address: wallet.address,
      })
      mockHasPublishedItems.mockResolvedValue(true)
      mockRecordEvent.mockImplementation((event) =>
        Promise.resolve({
          id: 'eventId',
          created_at: new Date('2026-11-12T10:00:00.000Z'),
          ...event,
        })
      )
    })

    describe('and the collection does not exist', () => {
      beforeEach(() => {
        mockFindCollection.mockResolvedValue(undefined)
        ;(Collection.count as jest.Mock).mockReset().mockResolvedValue(0)
      })

      it('should respond with a 404', () => {
        return post({ message: 'Hello' }).expect(404)
      })
    })

    describe('and the caller is neither on the committee nor manages the collection', () => {
      beforeEach(() => {
        mockFindCollection.mockResolvedValue({
          ...dbCollectionMock,
          eth_address: '0x0000000000000000000000000000000000000001',
          managers: [],
        })
      })

      it('should respond with a 401 without recording anything', () => {
        return post({ message: 'Hello' })
          .expect(401)
          .then(() => {
            expect(mockRecordEvent).not.toHaveBeenCalled()
          })
      })
    })

    describe('and the message is missing', () => {
      it('should respond with a 400', () => {
        return post({}).expect(400)
      })
    })

    describe('and the message is blank', () => {
      it('should respond with a 400', () => {
        return post({ message: '   ' })
          .expect(400)
          .then(() => {
            expect(mockRecordEvent).not.toHaveBeenCalled()
          })
      })
    })

    describe('and the message is longer than 2000 characters', () => {
      it('should respond with a 400', () => {
        return post({ message: 'a'.repeat(2001) }).expect(400)
      })
    })

    describe('and the message has 2000 characters plus surrounding spaces', () => {
      it('should accept it', () => {
        return post({ message: `  ${'a'.repeat(2000)}  ` }).expect(200)
      })
    })

    describe('and the item id is not a uuid', () => {
      it('should respond with a 400', () => {
        return post({ message: 'Hello', itemId: 'not-a-uuid' }).expect(400)
      })
    })

    describe('and the body has an unknown property', () => {
      it('should not store it', () => {
        return post({ message: 'Hello', actor: 'curator' })
          .expect(200)
          .then(() => {
            expect(mockRecordEvent).toHaveBeenCalledWith(
              expect.objectContaining({
                actor: CollectionEventActor.CREATOR,
                payload: { message: 'Hello' },
              })
            )
          })
      })
    })

    describe('and the collection is not published', () => {
      beforeEach(() => {
        mockHasPublishedItems.mockResolvedValue(false)
      })

      it('should respond with a 409 without recording anything', () => {
        return post({ message: 'Hello' })
          .expect(409)
          .then(() => {
            expect(mockRecordEvent).not.toHaveBeenCalled()
          })
      })
    })

    describe('and the item belongs to another collection', () => {
      beforeEach(() => {
        mockFindItem.mockResolvedValue({ id: 'x', collection_id: uuidv4() })
      })

      it('should respond with a 400 without recording anything', () => {
        return post({ message: 'Hello', itemId: uuidv4() })
          .expect(400)
          .then((response: any) => {
            expect(response.body.error).toBe(
              'The item does not belong to the collection'
            )
            expect(mockRecordEvent).not.toHaveBeenCalled()
          })
      })
    })

    describe('and the caller owns the collection', () => {
      let itemId: string

      beforeEach(() => {
        itemId = uuidv4()
        mockFindItem.mockResolvedValue({
          id: itemId,
          collection_id: dbCollectionMock.id,
        })
      })

      it('should store the trimmed message as a creator and respond with the event', () => {
        return post({ message: '  Is the hat fine now?\n', itemId })
          .expect(200)
          .then((response: any) => {
            expect(mockRecordEvent).toHaveBeenCalledWith({
              collection_id: dbCollectionMock.id,
              type: CollectionEventType.REVIEW_COMMENT,
              actor: CollectionEventActor.CREATOR,
              actor_address: wallet.address.toLowerCase(),
              payload: { message: 'Is the hat fine now?', itemId },
            })
            expect(response.body).toEqual({
              ok: true,
              data: {
                id: 'eventId',
                collection_id: dbCollectionMock.id,
                type: CollectionEventType.REVIEW_COMMENT,
                actor: CollectionEventActor.CREATOR,
                actor_address: wallet.address.toLowerCase(),
                payload: { message: 'Is the hat fine now?', itemId },
                created_at: '2026-11-12T10:00:00.000Z',
              },
            })
          })
      })

      it('should tell the curators channel', () => {
        return post({ message: ' Is the hat fine now? ' })
          .expect(200)
          .then(() => {
            expect(mockCommentPosted).toHaveBeenCalledWith(
              dbCollectionMock.id,
              wallet.address,
              'Is the hat fine now?'
            )
          })
      })

      it('should not open, close nor change any review request', () => {
        return post({ message: 'Hello' })
          .expect(200)
          .then(() => {
            expect(mockRecordEvent).toHaveBeenCalledTimes(1)
            expect(mockRecordEventOnce).not.toHaveBeenCalled()
            expect(CollectionCuration.create).not.toHaveBeenCalled()
            expect(CollectionCuration.update).not.toHaveBeenCalled()
            expect(sendValidation).not.toHaveBeenCalled()
          })
      })
    })

    describe('and the caller is on the committee', () => {
      beforeEach(() => {
        mockIsCommitteeMember.mockResolvedValue(true)
        mockFindCollection.mockResolvedValue({
          ...dbCollectionMock,
          eth_address: '0x0000000000000000000000000000000000000001',
        })
      })

      it('should store the message as a curator without telling the channel', () => {
        return post({ message: 'Please fix the thumbnail' })
          .expect(200)
          .then((response: any) => {
            expect(mockRecordEvent).toHaveBeenCalledWith({
              collection_id: dbCollectionMock.id,
              type: CollectionEventType.REVIEW_COMMENT,
              actor: CollectionEventActor.CURATOR,
              actor_address: wallet.address.toLowerCase(),
              payload: { message: 'Please fix the thumbnail' },
            })
            expect(response.body.data.actor).toBe(CollectionEventActor.CURATOR)
            expect(mockCommentPosted).not.toHaveBeenCalled()
          })
      })
    })

    describe('and the collection is a Third Party one', () => {
      beforeEach(() => {
        mockIsCommitteeMember.mockResolvedValue(true)
        mockFindCollection.mockResolvedValue(dbTPCollectionMock)
      })

      describe('and none of its items was sent to review', () => {
        beforeEach(() => {
          mockFindLastItemCuration.mockResolvedValue(undefined)
        })

        it('should respond with a 409', () => {
          return post({ message: 'Hello' }).expect(409)
        })
      })

      describe('and its items were sent to review', () => {
        beforeEach(() => {
          mockFindLastItemCuration.mockResolvedValue({ id: 'itemCurationId' })
        })

        it('should record the comment', () => {
          return post({ message: 'Hello' })
            .expect(200)
            .then(() => {
              expect(mockRecordEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                  type: CollectionEventType.REVIEW_COMMENT,
                })
              )
            })
        })
      })
    })
  })
})
