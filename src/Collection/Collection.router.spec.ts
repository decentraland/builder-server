import supertest from 'supertest'
import { v4 as uuidv4 } from 'uuid'
import {
  wallet,
  createAuthHeaders,
  buildURL,
  mockExistsMiddleware,
  mockAuthorizationMiddleware,
} from '../../spec/utils'
import { collectionAPI } from '../ethereum/api/collection'
import { app } from '../server'
import { Collection } from './Collection.model'
import { hasAccess } from './access'

const server = supertest(app.getApp())
jest.mock('../ethereum/api/collection')
jest.mock('./Collection.model')
jest.mock('./access')

describe('Collection router', () => {
  const collectionAttributes = {
    id: uuidv4(),
    name: 'Test',
    urn: null,
    eth_address: wallet.address,
    salt: '',
    contract_address: '0x02b6bD2420cCADC38726BD34BB7f5c52B3F4F3ff',
    is_published: false,
    is_approved: false,
    minters: [],
    managers: [],
    forum_link: null,
    lock: null,
    reviewed_at: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
  }

  const resultingCollectionAttributes = {
    ...collectionAttributes,
    reviewed_at: collectionAttributes.reviewed_at.toISOString(),
    created_at: collectionAttributes.created_at.toISOString(),
    updated_at: collectionAttributes.updated_at.toISOString(),
  }

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
      jest.restoreAllMocks()
    })

    it('should return the requested collection with the URN', () => {
      const url = `/collections/${collectionAttributes.id}`

      return server
        .get(buildURL(url))
        .set(createAuthHeaders('get', url))
        .expect(200)
        .then(async (response: any) => {
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
      jest.restoreAllMocks()
    })

    it('should update the lock with .now() on the supplied collection id for the owner', () => {
      const url = `/collections/${collectionAttributes.id}/lock`

      return server
        .post(buildURL(url))
        .set(createAuthHeaders('post', url))
        .expect(200)
        .then(async (response: any) => {
          expect(response.body).toEqual({ data: true, ok: true })
          expect(Collection.update).toHaveBeenCalledWith(
            { lock: new Date(now) },
            { id: collectionAttributes.id, eth_address: wallet.address }
          )
        })
    })
  })
})
