import supertest from 'supertest'
import { buildURL } from '../../spec/utils'
import { app } from '../server'
import { MAX_COORDS } from './LAND.router'
import { getLandRouterEnvs } from './utils'
import fetch from 'node-fetch'

jest.mock('./utils')
jest.mock('node-fetch')

const mockGetLandRouterEnvs = getLandRouterEnvs as jest.MockedFunction<
  typeof getLandRouterEnvs
>

const mockFetch = fetch as jest.MockedFunction<typeof fetch>

const server = supertest(app.getApp())

describe('LAND router', () => {
  let url: string

  beforeEach(() => {
    jest.clearAllMocks()

    mockGetLandRouterEnvs.mockImplementation(() => ({
      ipfsUrl: 'https://ipfs.xyz',
      ipfsProjectId: 'ipfsProjectId',
      ipfsApiKey: 'ipfsApiKey',
      explorerUrl: 'https://explorer.xyz',
    }))
  })

  describe('when creating a redirection file', () => {
    describe('and the coords in the url are invalid', () => {
      beforeEach(() => {
        url = '/lands/invalid/redirection'
      })

      it('should respond with 400 and invalid coords message', async () => {
        const { body } = await server.post(buildURL(url)).expect(400)

        expect(body).toEqual({
          data: { coords: 'invalid' },
          error: `Invalid coordinates`,
          ok: false,
        })
      })
    })

    describe('and the fetch to the ipfs server throws an error', () => {
      beforeEach(() => {
        url = '/lands/100,100/redirection'

        mockFetch.mockRejectedValueOnce(new Error('error'))
      })

      it('should respond with 500 and ipfs server could not be reached message', async () => {
        const { body } = await server.post(buildURL(url)).expect(500)

        expect(body).toEqual({
          data: {
            message: 'error',
          },
          error:
            'Failed to upload file to IPFS as the IPFS server could not be reached',
          ok: false,
        })
      })
    })

    describe('and the fetch to the ipfs server responds with an error', () => {
      beforeEach(() => {
        url = '/lands/100,100/redirection'

        //@ts-ignore
        mockFetch.mockResolvedValueOnce({
          ok: false,
          text: () => Promise.resolve('error'),
        })
      })

      it('should respond with 500 and ipfs server responded with non 200 status message', async () => {
        const { body } = await server.post(buildURL(url)).expect(500)

        expect(body).toEqual({
          data: {
            message: 'error',
          },
          error:
            'Failed to upload file to IPFS as the IPFS server responded with a non 200 status',
          ok: false,
        })
      })
    })

    describe('and the ipfs server responds the ipfs hash of the uploaded blob', () => {
      let responseHash: string

      beforeEach(() => {
        url = '/lands/100,100/redirection'
        responseHash = 'QmU1qAKrZKEUinZ7j7gbPcJ7dKSkJ6diHLk9YrB4PbLr7q'
        //@ts-ignore
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              Hash: responseHash,
            }),
        })
      })

      it('should respond with 500 and ipfs server responded with non 200 status message', async () => {
        const { body } = await server.post(buildURL(url)).expect(200)

        expect(body).toEqual({
          data: {
            ipfsHash: responseHash,
            contentHash:
              'e301017012205453e784584c205c23a771c67af071129721f0e21b0472e3061361005393a908',
          },
          ok: true,
        })
      })
    })
  })

  describe('when fetching the redirection file hashes', () => {
    beforeEach(() => {
      url = '/lands/redirectionHashes?'
    })

    describe('when coords is not provided as query param', () => {
      it('should respond with 400 and could not get coords message', async () => {
        const { body } = await server.get(buildURL(url)).expect(400)

        expect(body).toEqual({
          data: {},
          error: 'Could not get coords from request',
          ok: false,
        })
      })
    })

    describe('when more than the allowed coords are provided', () => {
      beforeEach(() => {
        url = `/lands/redirectionHashes?${new Array(MAX_COORDS + 1)
          .fill('coords=100,100')
          .join('&')}`
      })

      it('should respond with a 400 and invalid coordinates message', async () => {
        const { body } = await server.get(buildURL(url)).expect(400)

        expect(body).toEqual({
          data: { amount: 151 },
          error: `Max ${MAX_COORDS} coords`,
          ok: false,
        })
      })
    })

    describe('when the amount of coords provided is the same as MAX_COORDS', () => {
      describe('and all are valid', () => {
        beforeEach(() => {
          url = `/lands/redirectionHashes?${new Array(MAX_COORDS)
            .fill('coords=100,100')
            .join('&')}`
        })

        it('should respond with a 200 and objects with hashes for all provided coords', async () => {
          const { body } = await server.get(buildURL(url)).expect(200)

          expect(body).toEqual({
            data: new Array(MAX_COORDS).fill({
              contentHash:
                'e301017012205453e784584c205c23a771c67af071129721f0e21b0472e3061361005393a908',
              ipfsHash: 'QmU1qAKrZKEUinZ7j7gbPcJ7dKSkJ6diHLk9YrB4PbLr7q',
              x: 100,
              y: 100,
            }),
            ok: true,
          })
        })
      })
    })

    describe('when two coords query params are provided', () => {
      describe('and one of those coords is invalid', () => {
        beforeEach(() => {
          url = '/lands/redirectionHashes?coords=100,100&coords=invalid'
        })

        it('should respond with a 400 and invalid coordinates message', async () => {
          const { body } = await server.get(buildURL(url)).expect(400)

          expect(body).toEqual({
            data: {
              coords: 'invalid',
            },
            error: 'Invalid coordinates',
            ok: false,
          })
        })
      })

      describe('and both coords are valid', () => {
        beforeEach(() => {
          url = '/lands/redirectionHashes?coords=100,100&coords=200,200'
        })

        it('should respond with a 200 and and two objects with hashes for those coords', async () => {
          const { body } = await server.get(buildURL(url)).expect(200)

          expect(body).toEqual({
            data: [
              {
                contentHash:
                  'e301017012205453e784584c205c23a771c67af071129721f0e21b0472e3061361005393a908',
                ipfsHash: 'QmU1qAKrZKEUinZ7j7gbPcJ7dKSkJ6diHLk9YrB4PbLr7q',
                x: 100,
                y: 100,
              },
              {
                contentHash:
                  'e301017012204d02b4fe9cee2f8e4ab0a88adbf2338faa903355a0280d725f72f0f79929c079',
                ipfsHash: 'QmTXGVk1DtCP6km25iNUmEmV2Wf7dCFAziwiTzZNeQKM9z',
                x: 200,
                y: 200,
              },
            ],
            ok: true,
          })
        })
      })
    })

    describe('when only one coord query param is provided', () => {
      describe('and that coord is not a valid coord', () => {
        beforeEach(() => {
          url = '/lands/redirectionHashes?coords=invalid'
        })

        it('should respond with a 400 and invalid coordinates message', async () => {
          const { body } = await server.get(buildURL(url)).expect(400)

          expect(body).toEqual({
            data: {
              coords: 'invalid',
            },
            error: 'Invalid coordinates',
            ok: false,
          })
        })
      })

      describe('and that coord is a valid coord', () => {
        beforeEach(() => {
          url = '/lands/redirectionHashes?coords=100,100'
        })

        it('should respond with a 200 and and a single object with hashes for those coords', async () => {
          const { body } = await server.get(buildURL(url)).expect(200)

          expect(body).toEqual({
            data: [
              {
                contentHash:
                  'e301017012205453e784584c205c23a771c67af071129721f0e21b0472e3061361005393a908',
                ipfsHash: 'QmU1qAKrZKEUinZ7j7gbPcJ7dKSkJ6diHLk9YrB4PbLr7q',
                x: 100,
                y: 100,
              },
            ],
            ok: true,
          })
        })
      })
    })
  })
})
