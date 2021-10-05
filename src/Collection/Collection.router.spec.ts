import supertest from 'supertest'
import {
  wallet,
  createAuthHeaders,
  buildURL,
  mockExistsMiddleware,
  mockAuthorizationMiddleware,
  collectionAttributesMock,
} from '../../spec/utils'
import { collectionAPI } from '../ethereum/api/collection'
import { isCommitteeMember } from '../Committee'
import { app } from '../server'
import { Collection } from './Collection.model'
import { hasAccess } from './access'

const server = supertest(app.getApp())
jest.mock('../ethereum/api/collection')
jest.mock('./Collection.model')
jest.mock('../Committee')
jest.mock('./access')

describe('Collection router', () => {
  const collectionAttributes = { ...collectionAttributesMock }

  const resultingCollectionAttributes = {
    ...collectionAttributes,
    reviewed_at: collectionAttributes.reviewed_at.toISOString(),
    created_at: collectionAttributes.created_at.toISOString(),
    updated_at: collectionAttributes.updated_at.toISOString(),
  }

  describe('when retrieving all the collections', () => {
    beforeEach(() => {
      mockAuthorizationMiddleware(
        Collection,
        collectionAttributes.id,
        wallet.address
      )
      ;(isCommitteeMember as jest.Mock).mockResolvedValueOnce(true)
      ;(Collection.find as jest.Mock)
        .mockResolvedValueOnce([collectionAttributes])
        .mockResolvedValueOnce([])
      ;(Collection.findByContractAddresses as jest.Mock).mockResolvedValueOnce(
        []
      )
      ;(collectionAPI.fetchCollections as jest.Mock).mockResolvedValueOnce([])
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should return all the collections with the URN', () => {
      const url = `/collections`

      return server
        .get(buildURL(url))
        .set(createAuthHeaders('get', url))
        .expect(200)
        .then(async (response: any) => {
          expect(response.body).toEqual({
            data: [
              {
                ...resultingCollectionAttributes,
                urn: `urn:decentraland:ropsten:collections-v2:${collectionAttributes.contract_address}`,
              },
            ],
            ok: true,
          })
        })
    })
  })

  describe('when retrieving the collections of an address', () => {
    beforeEach(() => {
      mockAuthorizationMiddleware(
        Collection,
        collectionAttributes.id,
        wallet.address
      )
      ;(Collection.find as jest.Mock).mockReturnValueOnce([
        collectionAttributes,
      ])
      ;(Collection.findByContractAddresses as jest.Mock).mockReturnValueOnce([])
      ;(collectionAPI.fetchCollectionsByAuthorizedUser as jest.Mock).mockReturnValueOnce(
        []
      )
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should return the requested collections with the URN', () => {
      const url = `/${wallet.address}/collections`

      return server
        .get(buildURL(url))
        .set(createAuthHeaders('get', url))
        .expect(200)
        .then(async (response: any) => {
          expect(response.body).toEqual({
            data: [
              {
                ...resultingCollectionAttributes,
                urn: `urn:decentraland:ropsten:collections-v2:${collectionAttributes.contract_address}`,
              },
            ],
            ok: true,
          })
        })
    })
  })

  describe('when retrieving a single collection', () => {
    beforeEach(() => {
      mockExistsMiddleware(Collection, collectionAttributes.id)
      mockAuthorizationMiddleware(
        Collection,
        collectionAttributes.id,
        wallet.address
      )
      ;(hasAccess as jest.Mock).mockResolvedValueOnce(true)
      ;(Collection.findOne as jest.Mock).mockReturnValueOnce(
        collectionAttributes
      )
      ;(collectionAPI.fetchCollection as jest.Mock).mockReturnValueOnce(null)
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should return the requested collection with the URN', () => {
      const url = `/collections/${collectionAttributes.id}`

      return server
        .get(buildURL(url))
        .set(createAuthHeaders('get', url))
        .expect(200)
        .then((response: any) => {
          expect(response.body).toEqual({
            data: {
              ...resultingCollectionAttributes,
              urn: `urn:decentraland:ropsten:collections-v2:${collectionAttributes.contract_address}`,
            },
            ok: true,
          })
          expect(Collection.findOne).toHaveBeenCalledWith(
            collectionAttributes.id
          )
        })
    })
  })

  describe('when locking a Collection', () => {
    const now = 1633022119407

    beforeEach(() => {
      jest.spyOn(Date, 'now').mockReturnValueOnce(now)

      mockExistsMiddleware(Collection, collectionAttributes.id)
      mockAuthorizationMiddleware(
        Collection,
        collectionAttributes.id,
        wallet.address
      )
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should update the lock with .now() on the supplied collection id for the owner', () => {
      const url = `/collections/${collectionAttributes.id}/lock`

      return server
        .post(buildURL(url))
        .set(createAuthHeaders('post', url))
        .expect(200)
        .then((response: any) => {
          expect(response.body).toEqual({ data: true, ok: true })
          expect(Collection.update).toHaveBeenCalledWith(
            { lock: new Date(now) },
            { id: collectionAttributes.id, eth_address: wallet.address }
          )
        })
    })
  })
})