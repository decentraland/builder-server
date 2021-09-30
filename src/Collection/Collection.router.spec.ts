import supertest from 'supertest'
import { v4 as uuidv4 } from 'uuid'
import { Collection } from './Collection.model'
import { app } from '../server'
import {
  wallet,
  createAuthHeaders,
  buildURL,
  mockExistsMiddleware,
  mockAuthorizationMiddleware,
} from '../../spec/utils'

const server = supertest(app.getApp())
jest.mock('./Collection.model')

describe('Collection router', () => {
  const collectionAttributes = {
    id: uuidv4(),
    name: 'Test',
    eth_address: wallet.address,
    salt: '',
    contract_address: '',
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

  describe('when locking a Collection', () => {
    const now = 1633022119407
    const url = `/collections/${collectionAttributes.id}/lock`

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

    it('should update the lock with .now() on the supplied collection id for the owner', async () => {
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

    it('it should fail with an error if the update explodes', async () => {
      const errorMessage = 'Error message'

      ;(Collection.update as jest.Mock).mockImplementationOnce(() => {
        throw new Error(errorMessage)
      })

      return server
        .post(buildURL(url))
        .set(createAuthHeaders('post', url))
        .expect(500)
        .then(async (response: any) => {
          expect(response.body).toEqual({
            ok: false,
            data: {
              id: collectionAttributes.id,
              eth_address: wallet.address,
              error: errorMessage,
            },
            error: "The collection couldn't be updated",
          })
        })
    })
  })
})
