import supertest from 'supertest'
import { buildURL, createAuthHeaders } from '../../spec/utils'
import { TierFragment } from '../ethereum/api/fragments'
import { thirdPartyAPI } from '../ethereum/api/thirdParty'
import { app } from '../server'

jest.mock('../ethereum/api/thirdParty')

const server = supertest(app.getApp())

describe('when requesting all tiers', () => {
  const url = '/tiers/thirdParty'
  const errorMessage = 'Error fetching tiers'

  describe('and the tiers fetch fails', () => {
    beforeEach(() => {
      ;(thirdPartyAPI.fetchTiers as jest.MockedFunction<
        typeof thirdPartyAPI.fetchTiers
      >).mockRejectedValueOnce(new Error(errorMessage))
    })

    it('should respond with a 200 and a message signaling that an error occurred', () => {
      return server
        .get(buildURL(url))
        .set(createAuthHeaders('get', url))
        .expect(200)
        .then((response: any) => {
          expect(response.body).toEqual({
            error: errorMessage,
            data: {},
            ok: false,
          })
        })
    })
  })

  describe('and the tiers fetch is successful', () => {
    let tiers: TierFragment[]

    beforeEach(() => {
      tiers = [
        { id: '1', value: '100', price: '0' },
        { id: '2', value: '200', price: '1' },
        { id: '3', value: '300', price: '2' },
      ]
      ;(thirdPartyAPI.fetchTiers as jest.MockedFunction<
        typeof thirdPartyAPI.fetchTiers
      >).mockResolvedValueOnce(tiers)
    })

    it('should respond with a 200 and a list of tiers', () => {
      return server
        .get(buildURL(url))
        .set(createAuthHeaders('get', url))
        .expect(200)
        .then((response: any) => {
          expect(response.body).toEqual({
            data: tiers,
            ok: true,
          })
        })
    })
  })
})
