import supertest from 'supertest'
import { createAuthHeaders, buildURL } from '../../spec/utils'
import { ItemCuration } from '../Curation/ItemCuration'
import {
  ThirdPartyFragment,
  ThirdPartyMetadataType,
} from '../ethereum/api/fragments'
import { thirdPartyAPI } from '../ethereum/api/thirdParty'
import { app } from '../server'
import { ThirdParty } from './ThirdParty.types'
import { toThirdParty } from './utils'

const server = supertest(app.getApp())

jest.mock('../ethereum/api/thirdParty')
jest.mock('../Curation/ItemCuration')

describe('ThirdParty router', () => {
  let fragments: ThirdPartyFragment[]
  let thirdParties: ThirdParty[]

  beforeEach(() => {
    let metadata = {
      type: ThirdPartyMetadataType.THIRD_PARTY_V1,
      thirdParty: { name: 'a name', description: 'a description' },
    }
    fragments = [
      {
        id: '1',
        root: 'aRoot',
        managers: ['0x1'],
        maxItems: '3',
        metadata,
      },
      {
        id: '2',
        root: 'anotherRoot',
        managers: ['0x2', '0x3'],
        maxItems: '2',
        metadata,
      },
    ]
    thirdParties = fragments.map(toThirdParty)
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when retrieving all third party records', () => {
    let url: string

    beforeEach(() => {
      ;(thirdPartyAPI.fetchThirdPartiesByManager as jest.Mock).mockResolvedValueOnce(
        fragments
      )
      url = '/thirdParties'
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

  describe('when using a query string to filter', () => {
    let url: string
    let manager: string
    let managerFragments: ThirdPartyFragment[]
    let managerThirdParties: ThirdParty[]

    beforeEach(() => {
      manager = '0x1'
      managerFragments = fragments.slice(0, 1)
      ;(thirdPartyAPI.fetchThirdPartiesByManager as jest.Mock).mockResolvedValueOnce(
        managerFragments
      )
      managerThirdParties = managerFragments.map(toThirdParty)
      url = '/thirdParties'
    })

    it('should return the third parties for a particular manager', () => {
      const queryString = { manager }
      return server
        .get(buildURL(url, queryString))
        .set(createAuthHeaders('get', url))
        .expect(200)
        .then((response: any) => {
          expect(response.body).toEqual({
            data: managerThirdParties,
            ok: true,
          })
          expect(thirdPartyAPI.fetchThirdPartiesByManager).toHaveBeenCalledWith(
            manager
          )
        })
    })
  })

  describe('when retrieving the available slots for a third party', () => {
    let url: string
    let maxSlots: number
    let itemsInCuration: number

    beforeEach(() => {
      maxSlots = 10
      itemsInCuration = 6
      ;(thirdPartyAPI.fetchMaxItemsByThirdParty as jest.Mock).mockResolvedValueOnce(
        maxSlots
      )
      ;(thirdPartyAPI.isManager as jest.Mock).mockResolvedValueOnce(true)
      ;(ItemCuration.countByThirdPartyId as jest.Mock).mockResolvedValueOnce(
        itemsInCuration
      )
      url = '/thirdParties/aThirdPartyId/slots'
    })

    it('should respond with the difference between the maximum slots of the third party and the items in curation', () => {
      return server
        .get(buildURL(url))
        .set(createAuthHeaders('get', url))
        .expect(200)
        .then((response: any) => {
          expect(response.body).toEqual({
            data: maxSlots - itemsInCuration,
            ok: true,
          })
        })
    })
  })

  describe('when retrieving a third party', () => {
    let url: string
    let thirdPartyId: string

    beforeEach(() => {
      thirdPartyId = 'aThirdPartyId'
      url = `/thirdParties/${thirdPartyId}`
    })

    describe('and the third party does not exist', () => {
      beforeEach(() => {
        ;(thirdPartyAPI.fetchThirdParty as jest.Mock).mockResolvedValueOnce(
          undefined
        )
      })

      it("should respond with a 404 signaling that the third party doesn't exist", () => {
        return server
          .get(buildURL(url))
          .set(createAuthHeaders('get', url))
          .expect(404)
          .then((response: any) => {
            expect(response.body).toEqual({
              data: { id: 'aThirdPartyId' },
              ok: false,
              error: "The Third Party doesn't exists.",
            })
          })
      })
    })

    describe('and the third party exists', () => {
      beforeEach(() => {
        ;(thirdPartyAPI.fetchThirdParty as jest.Mock).mockResolvedValueOnce(
          fragments[0]
        )
      })

      it('should respond with the requested third party', () => {
        return server
          .get(buildURL(url))
          .set(createAuthHeaders('get', url))
          .expect(200)
          .then((response: any) => {
            expect(response.body).toEqual({ data: thirdParties[0], ok: true })
          })
      })
    })
  })
})
