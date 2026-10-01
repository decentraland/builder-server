import supertest from 'supertest'
import { v4 as uuidv4 } from 'uuid'
import {
  buildURL,
  createAuthHeaders,
  mockExistsMiddleware,
} from '../../spec/utils'
import { wallet } from '../../spec/mocks/wallet'
import { dbCollectionMock } from '../../spec/mocks/collections'
import { app } from '../server'
import { Collection } from '../Collection/Collection.model'
import { isCommitteeMember } from '../Committee'
import { isFeatureFlagEnabled } from '../utils/features'
import { CollectionCuration } from './CollectionCuration'
import {
  CollectionEvent,
  CollectionEventActor,
  CollectionEventAttributes,
  CollectionEventType,
} from './CollectionEvent'
import { CurationStatus } from './Curation.types'
import { requestValidation as sendValidation } from './validationQueue'

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
jest.mock('./slack')

const server = supertest(app.getApp())
const callbackToken = 'callback-token-example123'

const mockIsCommitteeMember = isCommitteeMember as jest.Mock
const mockIsFeatureFlagEnabled = isFeatureFlagEnabled as jest.Mock
const mockFindVerdict = CollectionEvent.findVerdictByValidationId as jest.Mock
const mockRecordEventOnce = CollectionEvent.recordOnce as jest.Mock
const mockFindLatestEvent = CollectionEvent.findLatestByCollectionId as jest.Mock
const mockFindLatestEventByType = CollectionEvent.findLatestByCollectionIdAndType as jest.Mock
const mockFindEventsSince = CollectionEvent.findByCollectionIdSince as jest.Mock
const mockFindEventsPage = CollectionEvent.findPageByCollectionId as jest.Mock
const mockFindLatestCuration = CollectionCuration.findLatestByCollectionId as jest.Mock

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

  beforeEach(() => {
    mockIsFeatureFlagEnabled.mockResolvedValue(true)
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when the auto curation flag is off', () => {
    beforeEach(() => {
      mockIsFeatureFlagEnabled.mockResolvedValue(false)
      process.env.BUILDER_CALLBACK_TOKEN = callbackToken
      ;(Collection.findOne as jest.Mock).mockResolvedValue(dbCollectionMock)
    })

    afterEach(() => {
      delete process.env.BUILDER_CALLBACK_TOKEN
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

    it('should answer 404 on the events', () => {
      url = `/collections/${dbCollectionMock.id}/events`
      return server
        .get(buildURL(url))
        .set(createAuthHeaders('get', url))
        .expect(404)
    })

    it('should answer 404 on the validator callback', () => {
      url = `/collections/${dbCollectionMock.id}/validation-result`
      return server
        .post(buildURL(url))
        .set('Authorization', `Bearer ${callbackToken}`)
        .send({ validationId: 'x', verdict: 'passed', items: [] })
        .expect(404)
        .then(() => expect(mockRecordEventOnce).not.toHaveBeenCalled())
    })
  })

  describe('when receiving a validation result', () => {
    const result = {
      validationId: 'latestValidation',
      verdict: 'passed',
      items: [
        { itemId: uuidv4(), contentHash: 'aHash', passed: true, findings: [] },
      ],
    }

    beforeAll(() => {
      process.env.BUILDER_CALLBACK_TOKEN = callbackToken
    })

    afterAll(() => {
      delete process.env.BUILDER_CALLBACK_TOKEN
    })

    beforeEach(() => {
      url = `/collections/${dbCollectionMock.id}/validation-result`
      mockExistsMiddleware(Collection, dbCollectionMock.id)
      ;(Collection.findOne as jest.Mock).mockResolvedValue(dbCollectionMock)
      mockFindLatestEventByType.mockResolvedValue(
        buildEvent(CollectionEventType.REVIEW_AI_STARTED, {
          validationId: 'latestValidation',
        })
      )
      mockFindLatestCuration.mockResolvedValue({
        id: 'curationId',
        status: CurationStatus.PENDING,
      })
      mockRecordEventOnce.mockImplementation((event) => Promise.resolve(event))
    })

    describe('and the request has no bearer token', () => {
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

    describe('and the bearer token is wrong', () => {
      it('should respond with a 401 without touching the events', () => {
        return server
          .post(buildURL(url))
          .set('Authorization', 'Bearer not-the-token')
          .send(result)
          .expect(401)
          .then(() => {
            expect(mockRecordEventOnce).not.toHaveBeenCalled()
          })
      })
    })

    describe('and the body is invalid', () => {
      it('should respond with a 400', () => {
        return server
          .post(buildURL(url))
          .set('Authorization', `Bearer ${callbackToken}`)
          .send({ validationId: 'latestValidation', verdict: 'maybe' })
          .expect(400)
          .then(() => {
            expect(mockRecordEventOnce).not.toHaveBeenCalled()
          })
      })
    })

    describe('and the validation is not the latest one', () => {
      it('should respond with a 204 and ignore it', () => {
        return server
          .post(buildURL(url))
          .set('Authorization', `Bearer ${callbackToken}`)
          .send({ ...result, validationId: 'staleValidation' })
          .expect(204)
          .then(() => {
            expect(mockRecordEventOnce).not.toHaveBeenCalled()
            expect(CollectionCuration.update).not.toHaveBeenCalled()
          })
      })
    })

    describe('and the validation is the latest one', () => {
      it('should respond with a 204 and record the verdict', () => {
        return server
          .post(buildURL(url))
          .set('Authorization', `Bearer ${callbackToken}`)
          .send(result)
          .expect(204)
          .then(() => {
            expect(mockRecordEventOnce).toHaveBeenCalledWith(
              expect.objectContaining({
                type: CollectionEventType.REVIEW_AI_PASSED,
                payload: result,
              })
            )
          })
      })

      describe('and the verdict is an unsupported error', () => {
        it('should accept the reason field and hand the collection to a curator', () => {
          return server
            .post(buildURL(url))
            .set('Authorization', `Bearer ${callbackToken}`)
            .send({ ...result, verdict: 'error', reason: 'unsupported' })
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
          return server
            .post(buildURL(url))
            .set('Authorization', `Bearer ${callbackToken}`)
            .send({ ...result, verdict: 'rejected' })
            .expect(204)
            .then(() => {
              expect(CollectionCuration.update).toHaveBeenCalledWith(
                expect.objectContaining({
                  status: CurationStatus.REJECTED,
                  reviewed_by: 'validator',
                }),
                { id: 'curationId' }
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
      aiEvent = buildEvent(CollectionEventType.REVIEW_AI_PASSED, {
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
                    type: CollectionEventType.REVIEW_AI_PASSED,
                    payload: { verdict: 'passed', items: [] },
                  }),
                ],
                total: 1,
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
          buildEvent(CollectionEventType.REVIEW_AI_STARTED, {
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
          buildEvent(CollectionEventType.REVIEW_AI_REJECTED),
          buildEvent(CollectionEventType.REVIEW_AI_REJECTED),
          buildEvent(CollectionEventType.REVIEW_AI_PASSED),
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
      it('should respond with a 400', () => {
        return server
          .post(buildURL(url))
          .set(createAuthHeaders('post', url))
          .send({})
          .expect(400)
      })
    })

    describe('and an appeal is already open', () => {
      beforeEach(() => {
        mockFindLatestEvent.mockResolvedValue(
          buildEvent(CollectionEventType.REVIEW_APPEAL_REQUESTED)
        )
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
})
