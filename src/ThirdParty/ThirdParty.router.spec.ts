import supertest from 'supertest'
import { createAuthHeaders, buildURL } from '../../spec/utils'
import { app } from '../server'
import { ThirdParty } from './ThirdParty.types'
import { ThirdPartyService } from './ThirdParty.service'
import {
  NonExistentThirdPartyError,
  OnlyDeletableIfOnGraphError,
  UnauthorizedThirdPartyManagerError,
} from './ThirdParty.errors'

const server = supertest(app.getApp())

jest.mock('../ethereum/api/thirdParty')
jest.mock('../Curation/ItemCuration')
jest.mock('./ThirdParty.service')

describe('ThirdParty router', () => {
  let thirdParties: ThirdParty[]

  beforeEach(() => {
    thirdParties = [
      {
        id: '1',
        root: 'aRoot',
        isApproved: true,
        managers: ['0x1'],
        maxItems: '3',
        name: 'a name',
        description: 'a description',
        contracts: [{ network: 'amoy', address: '0x0' }],
        published: true,
        isProgrammatic: false,
      },
      {
        id: '2',
        root: 'anotherRoot',
        isApproved: true,
        managers: ['0x2', '0x3'],
        maxItems: '2',
        name: 'another name',
        description: 'another description',
        contracts: [{ network: 'amoy', address: '0x1' }],
        published: true,
        isProgrammatic: false,
      },
    ]
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when retrieving all third party records', () => {
    let url: string

    beforeEach(() => {
      ;(ThirdPartyService.getThirdParties as jest.Mock).mockResolvedValueOnce(
        thirdParties
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

    beforeEach(() => {
      manager = '0x1'
      ;(ThirdPartyService.getThirdParties as jest.Mock).mockResolvedValueOnce(
        thirdParties
      )
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
            data: thirdParties,
            ok: true,
          })
          expect(ThirdPartyService.getThirdParties).toHaveBeenCalledWith(
            manager
          )
        })
    })
  })

  describe('when retrieving the available slots for a third party', () => {
    let url: string
    let availableSlots: number

    beforeEach(() => {
      availableSlots = 10
      ;(ThirdPartyService.getThirdPartyAvailableSlots as jest.Mock).mockResolvedValueOnce(
        availableSlots
      )
      ;(ThirdPartyService.isManager as jest.Mock).mockResolvedValueOnce(true)
      url = '/thirdParties/aThirdPartyId/slots'
    })

    it('should respond with the difference between the maximum slots of the third party and the items in curation', () => {
      return server
        .get(buildURL(url))
        .set(createAuthHeaders('get', url))
        .expect(200)
        .then((response: any) => {
          expect(response.body).toEqual({
            data: availableSlots,
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
        ;(ThirdPartyService.getThirdParty as jest.Mock).mockRejectedValueOnce(
          new NonExistentThirdPartyError(thirdPartyId)
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
        ;(ThirdPartyService.getThirdParty as jest.Mock).mockResolvedValueOnce(
          thirdParties[0]
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

  describe('when removing a virtual third party', () => {
    let url: string
    let thirdPartyId: string

    beforeEach(() => {
      thirdPartyId = 'aThirdPartyId'
      url = `/thirdParties/${thirdPartyId}`
    })

    describe('and the virtual third party does not exist', () => {
      beforeEach(() => {
        ;(ThirdPartyService.removeVirtualThirdParty as jest.Mock).mockRejectedValueOnce(
          new NonExistentThirdPartyError(thirdPartyId)
        )
      })

      it('should return a 404 status code and an error message', () => {
        return server
          .delete(buildURL(url))
          .set(createAuthHeaders('delete', url))
          .expect(404)
          .then((response: any) => {
            expect(response.body).toEqual({
              data: { id: thirdPartyId },
              ok: false,
              error: "The Third Party doesn't exists.",
            })
          })
      })
    })
    describe('and the user is not a manager of the virtual third party', () => {
      beforeEach(() => {
        ;(ThirdPartyService.removeVirtualThirdParty as jest.Mock).mockRejectedValueOnce(
          new UnauthorizedThirdPartyManagerError(thirdPartyId)
        )
      })

      it('should return a 401 status code and an error message', () => {
        return server
          .delete(buildURL(url))
          .set(createAuthHeaders('delete', url))
          .expect(401)
          .then((response: any) => {
            expect(response.body).toEqual({
              data: { id: thirdPartyId },
              ok: false,
              error: 'You are not the manager of this Third Party.',
            })
          })
      })
    })
    describe('and the virtual third party does not has its graph version', () => {
      beforeEach(() => {
        ;(ThirdPartyService.removeVirtualThirdParty as jest.Mock).mockRejectedValueOnce(
          new OnlyDeletableIfOnGraphError(thirdPartyId)
        )
      })

      it('should return a 400 status code and an error message', () => {
        return server
          .delete(buildURL(url))
          .set(createAuthHeaders('delete', url))
          .expect(400)
          .then((response: any) => {
            expect(response.body).toEqual({
              data: { id: thirdPartyId },
              ok: false,
              error:
                "The Third Party can only be deleted if it's already on the graph.",
            })
          })
      })
    })
  })

  describe('when updating a virtual third party', () => {
    let url: string
    let thirdPartyId: string
    let updateParameters: any

    beforeEach(() => {
      thirdPartyId = 'aThirdPartyId'
      updateParameters = { isProgrammatic: true }
      url = `/thirdParties/${thirdPartyId}`
    })

    describe('and the virtual third party does not exist', () => {
      beforeEach(() => {
        ;(ThirdPartyService.updateVirtualThirdParty as jest.Mock).mockRejectedValueOnce(
          new NonExistentThirdPartyError(thirdPartyId)
        )
      })

      it('should return a 404 status code and an error message', () => {
        return server
          .patch(buildURL(url))
          .set(createAuthHeaders('patch', url))
          .send(updateParameters)
          .expect(404)
          .then((response: any) => {
            expect(response.body).toEqual({
              data: { id: thirdPartyId },
              ok: false,
              error: "The Third Party doesn't exists.",
            })
          })
      })
    })
    describe('and the user is not a manager of the virtual third party', () => {
      beforeEach(() => {
        ;(ThirdPartyService.updateVirtualThirdParty as jest.Mock).mockRejectedValueOnce(
          new UnauthorizedThirdPartyManagerError(thirdPartyId)
        )
      })

      it('should return a 401 status code and an error message', () => {
        return server
          .patch(buildURL(url))
          .set(createAuthHeaders('patch', url))
          .send(updateParameters)
          .expect(401)
          .then((response: any) => {
            expect(response.body).toEqual({
              data: { id: thirdPartyId },
              ok: false,
              error: 'You are not the manager of this Third Party.',
            })
          })
      })
    })

    describe('and the virtual third party exists', () => {
      beforeEach(() => {
        ;(ThirdPartyService.updateVirtualThirdParty as jest.Mock).mockResolvedValueOnce(
          thirdParties[0]
        )
      })

      it('should return a 200 status code', () => {
        return server
          .patch(buildURL(url))
          .set(createAuthHeaders('patch', url))
          .send(updateParameters)
          .expect(200)
          .then((response: any) => {
            expect(response.body).toEqual({ data: undefined, ok: true })
          })
      })
    })
  })
})
