import supertest from 'supertest'
import { v4 as uuidv4 } from 'uuid'
import { buildURL } from '../../spec/utils'
import { dbCollectionMock } from '../../spec/mocks/collections'
import { app } from '../server'
import { isFeatureFlagEnabled } from '../utils/features'
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

const server = supertest(app.getApp())
const callbackSecret = 'local-secret-example123'

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

describe('AutoCuration router', () => {
  let url: string
  let result: Record<string, any>
  let logSpy: jest.SpyInstance

  // The component logger writes to stderr.
  const loggedLines = () => logSpy.mock.calls.map((call) => String(call[0]))

  beforeAll(() => {
    process.env.WEARABLE_VALIDATOR_CALLBACK_SECRET = callbackSecret
  })

  afterAll(() => {
    delete process.env.WEARABLE_VALIDATOR_CALLBACK_SECRET
  })

  beforeEach(() => {
    url = `/collections/${dbCollectionMock.id}/validation-result`
    result = {
      validationId: 'aValidation',
      collectionId: dbCollectionMock.id,
      verdict: 'passed',
      rulesVersion: '0.5.0',
      items: [
        {
          itemId: uuidv4(),
          contentHash: 'aHash',
          passed: true,
          findings: [],
        },
      ],
    }
    logSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
    ;(isFeatureFlagEnabled as jest.Mock).mockResolvedValue(false)
  })

  afterEach(() => {
    jest.resetAllMocks()
    jest.restoreAllMocks()
  })

  describe('when receiving a validation result', () => {
    it('should respond with a 204 and log the verdict, with the flag off', () => {
      return postSigned(url, result)
        .expect(204)
        .then(() => {
          const logged = loggedLines().find((line) =>
            line.includes('aValidation')
          )
          expect(logged).toContain(dbCollectionMock.id)
          expect(logged).toContain('passed')
          expect(logged).toContain('0.5.0')
          expect(logged).toContain(`${result.items[0].itemId}=true`)
        })
    })

    describe('and an item has no verdict', () => {
      beforeEach(() => {
        result.items = [{ ...result.items[0], passed: null, findings: [] }]
      })

      it('should log it as undecided', () => {
        return postSigned(url, result)
          .expect(204)
          .then(() => {
            expect(
              loggedLines().some((line) => line.includes('=undecided'))
            ).toBe(true)
          })
      })
    })

    describe('and the result carries every field the validator job sends', () => {
      beforeEach(() => {
        result = {
          ...result,
          verdict: 'error',
          reason: 'unsupported',
          retryable: false,
          items: [
            {
              itemId: uuidv4(),
              contentHash: 'aHash',
              passed: false,
              findings: [
                {
                  rule: 'thumbnail',
                  check: 'transparent-background',
                  severity: 'error',
                  message: 'The thumbnail has no transparent background',
                  where: 'thumbnail.png',
                  bodyShape: 'male',
                  measured: 0,
                  limit: 1,
                  fix: 'Export the thumbnail with transparency',
                  docs: 'https://docs.decentraland.org/creator/wearables/',
                },
              ],
              visualSummary: 'A blue hat',
              unsupported: true,
              error: 'render failed',
            },
          ],
        }
      })

      it('should accept it', () => {
        return postSigned(url, result).expect(204)
      })
    })

    describe('and the request is not signed', () => {
      it('should respond with a 401 without logging', () => {
        return server
          .post(buildURL(url))
          .send(result)
          .expect(401)
          .then(() => {
            expect(
              loggedLines().some((line) => line.includes('aValidation'))
            ).toBe(false)
          })
      })
    })

    describe('and the signature was made with another secret', () => {
      it('should respond with a 401', () => {
        return postSigned(url, result, {
          secret: 'another-secret-example123',
        }).expect(401)
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
      })
    })

    describe('and the timestamp is more than five minutes old', () => {
      it('should respond with a 401', () => {
        return postSigned(url, result, {
          timestamp: String(Date.now() - 6 * 60 * 1000),
        }).expect(401)
      })
    })

    describe('and the body is not JSON so there is no raw body', () => {
      it('should respond with a 401', () => {
        return postSigned(url, result, { contentType: 'text/plain' }).expect(
          401
        )
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
          validationId: 'aValidation',
          verdict: 'maybe',
        }).expect(400)
      })
    })

    describe('and the body has an unknown top level field', () => {
      it('should accept it, the schema drops the field', () => {
        return postSigned(url, { ...result, unexpected: true }).expect(204)
      })
    })

    describe('and the body is for another collection', () => {
      it('should respond with a 400', () => {
        return postSigned(url, { ...result, collectionId: uuidv4() })
          .expect(400)
          .then((response) => {
            expect(response.body.error).toBe(
              'The result belongs to another collection'
            )
          })
      })
    })

    describe('and the collection does not exist any more', () => {
      it('should still respond with a 204 so the job does not retry it', () => {
        const id = uuidv4()
        return postSigned(`/collections/${id}/validation-result`, {
          ...result,
          collectionId: id,
        }).expect(204)
      })
    })
  })
})
