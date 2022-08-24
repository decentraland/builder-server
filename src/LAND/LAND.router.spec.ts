import supertest from 'supertest'
import { buildURL } from '../../spec/utils'
import { app } from '../server'
import { MAX_COORDS } from './LAND.router'

const server = supertest(app.getApp())

describe('LAND router', () => {
  let url: string

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
                'e30101701220166b6b4d93ece408525081ade3c0258c6e992180d9b4ceb469d08192589095d7',
              ipfsHash: 'QmPrAgSua8WLPZ4CNL6tGMSdN45Kte3WjPJTPjfQSfv1kJ',
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
                  'e30101701220166b6b4d93ece408525081ade3c0258c6e992180d9b4ceb469d08192589095d7',
                ipfsHash: 'QmPrAgSua8WLPZ4CNL6tGMSdN45Kte3WjPJTPjfQSfv1kJ',
                x: 100,
                y: 100,
              },
              {
                contentHash:
                  'e301017012207a05747aa476fe4f72b0316b99b6f5af96be152288d9a840aba5d2bc17bd88b7',
                ipfsHash: 'QmWYyGnw1QRSZDZKaXppu9GW37JtFGdhgADLVSagguXgjg',
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
                  'e30101701220166b6b4d93ece408525081ade3c0258c6e992180d9b4ceb469d08192589095d7',
                ipfsHash: 'QmPrAgSua8WLPZ4CNL6tGMSdN45Kte3WjPJTPjfQSfv1kJ',
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
