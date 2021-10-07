import supertest from 'supertest'
import { omit } from 'decentraland-commons/dist/utils'
import {
  wallet,
  createAuthHeaders,
  buildURL,
  mockExistsMiddleware,
  mockAuthorizationMiddleware,
} from '../../spec/utils'
import { collectionAttributesMock } from '../../spec/mocks/collections'
import { collectionAPI } from '../ethereum/api/collection'
import { isCommitteeMember } from '../Committee'
import { app } from '../server'
import { Collection } from './Collection.model'
import { hasAccess } from './access'
import { CollectionAttributes, FullCollection } from './Collection.types'

const server = supertest(app.getApp())
jest.mock('../ethereum/api/collection')
jest.mock('./Collection.model')
jest.mock('../Committee')
jest.mock('./access')

type ResultCollection = Omit<
  FullCollection,
  'reviewed_at' | 'created_at' | 'updated_at' | 'urn_suffix'
> & {
  reviewed_at: string
  created_at: string
  updated_at: string
  urn_suffix: unknown
}

describe('Collection router', () => {
  let dbCollection: CollectionAttributes
  let resultingCollectionAttributes: ResultCollection
  let url: string

  beforeEach(() => {
    dbCollection = { ...collectionAttributesMock }
    resultingCollectionAttributes = omit(
      {
        ...dbCollection,
        reviewed_at: dbCollection.reviewed_at!.toISOString(),
        created_at: dbCollection.created_at.toISOString(),
        updated_at: dbCollection.updated_at.toISOString(),
        urn: '',
      },
      ['urn_suffix']
    )
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when retrieving all the collections', () => {
    beforeEach(() => {
      mockAuthorizationMiddleware(Collection, dbCollection.id, wallet.address)
      ;(isCommitteeMember as jest.Mock).mockResolvedValueOnce(true)
      ;(Collection.find as jest.Mock)
        .mockResolvedValueOnce([dbCollection])
        .mockResolvedValueOnce([])
      ;(Collection.findByContractAddresses as jest.Mock).mockResolvedValueOnce(
        []
      )
      ;(collectionAPI.fetchCollections as jest.Mock).mockResolvedValueOnce([])
      url = `/collections`
    })

    it('should return all the collections with the URN', () => {
      return server
        .get(buildURL(url))
        .set(createAuthHeaders('get', url))
        .expect(200)
        .then(async (response: any) => {
          expect(response.body).toEqual({
            data: [
              {
                ...resultingCollectionAttributes,
                urn: `urn:decentraland:ropsten:collections-v2:${dbCollection.contract_address}`,
              },
            ],
            ok: true,
          })
        })
    })
  })

  describe('when retrieving the collections of an address', () => {
    beforeEach(() => {
      mockAuthorizationMiddleware(Collection, dbCollection.id, wallet.address)
      ;(Collection.find as jest.Mock).mockReturnValueOnce([dbCollection])
      ;(Collection.findByContractAddresses as jest.Mock).mockReturnValueOnce([])
      ;(collectionAPI.fetchCollectionsByAuthorizedUser as jest.Mock).mockReturnValueOnce(
        []
      )
      url = `/${wallet.address}/collections`
    })

    it('should return the requested collections with the URN', () => {
      return server
        .get(buildURL(url))
        .set(createAuthHeaders('get', url))
        .expect(200)
        .then(async (response: any) => {
          expect(response.body).toEqual({
            data: [
              {
                ...resultingCollectionAttributes,
                urn: `urn:decentraland:ropsten:collections-v2:${dbCollection.contract_address}`,
              },
            ],
            ok: true,
          })
        })
    })
  })

  describe('when retrieving a single collection', () => {
    beforeEach(() => {
      mockExistsMiddleware(Collection, dbCollection.id)
      mockAuthorizationMiddleware(Collection, dbCollection.id, wallet.address)
      ;(hasAccess as jest.Mock).mockResolvedValueOnce(true)
      ;(Collection.findOne as jest.Mock).mockReturnValueOnce(dbCollection)
      ;(collectionAPI.fetchCollection as jest.Mock).mockReturnValueOnce(null)
      url = `/collections/${dbCollection.id}`
    })

    it('should return the requested collection with the URN', () => {
      return server
        .get(buildURL(url))
        .set(createAuthHeaders('get', url))
        .expect(200)
        .then((response: any) => {
          expect(response.body).toEqual({
            data: {
              ...resultingCollectionAttributes,
              urn: `urn:decentraland:ropsten:collections-v2:${dbCollection.contract_address}`,
            },
            ok: true,
          })
          expect(Collection.findOne).toHaveBeenCalledWith(dbCollection.id)
        })
    })
  })

  describe('when locking a Collection', () => {
    const now = 1633022119407
    beforeEach(() => {
      jest.spyOn(Date, 'now').mockReturnValueOnce(now)
      mockExistsMiddleware(Collection, dbCollection.id)
      mockAuthorizationMiddleware(Collection, dbCollection.id, wallet.address)
      url = `/collections/${dbCollection.id}/lock`
    })

    describe('when the lock update succeeds', () => {
      it('should update the lock with .now() on the supplied collection id for the owner', () => {
        const lock = new Date(now)
        return server
          .post(buildURL(url))
          .set(createAuthHeaders('post', url))
          .expect(200)
          .then((response: any) => {
            expect(response.body).toEqual({
              data: lock.toISOString(),
              ok: true,
            })
            expect(Collection.update).toHaveBeenCalledWith(
              { lock },
              { id: dbCollection.id, eth_address: wallet.address }
            )
          })
      })
    })

    describe('when the lock update fails', () => {
      const errorMessage = 'Error message'

      beforeEach(() => {
        ;(Collection.update as jest.Mock).mockRejectedValueOnce(
          new Error(errorMessage)
        )
      })

      it('should fail with an error if the update throws', () => {
        return server
          .post(buildURL(url))
          .set(createAuthHeaders('post', url))
          .expect(500)
          .then((response: any) => {
            expect(response.body).toEqual({
              ok: false,
              data: {
                id: dbCollection.id,
                eth_address: wallet.address,
                error: errorMessage,
              },
              error: "The collection couldn't be updated",
            })
          })
      })
    })
  })
})
