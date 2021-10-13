import supertest from 'supertest'
import { createAuthHeaders, buildURL } from '../../spec/utils'
import { ThirdPartyFragment } from '../ethereum/api/fragments'
import { thirdPartyAPI } from '../ethereum/api/thirdParty'
import { app } from '../server'

const server = supertest(app.getApp())

jest.mock('../ethereum/api/thirdParty')

describe('ThirdParty router', () => {
  describe('when retreiving all third party records', () => {
    let url: string
    let thirdParties: ThirdPartyFragment[]

    beforeEach(() => {
      thirdParties = [
        {
          id: '1',
          managers: ['0x1'],
          isApproved: true,
          maxItems: 2,
          totalItems: 1,
        },
        {
          id: '2',
          managers: ['0x2', '0x3'],
          isApproved: true,
          maxItems: 10,
          totalItems: 3,
        },
      ]
      ;(thirdPartyAPI.fetchThirdParties as jest.Mock).mockResolvedValueOnce(
        thirdParties
      )
      url = '/thirdParties'
    })

    afterEach(() => {
      jest.restoreAllMocks()
    })

    it('should respond with a third party array', () => {
      return server
        .get(buildURL(url))
        .set(createAuthHeaders('get', url))
        .expect(200)
        .then((response: any) => {
          expect(response.body).toEqual({ data: thirdParties, ok: true })
        })
    })
  })
})
