import supertest from 'supertest'
import express from 'express'
import { ethers } from 'ethers'
import { buildURL } from '../../spec/utils'
import { app } from '../server'
import { withValidContractAddress, withValidItemId } from './url'

const simpleResponseHandler = (_: express.Request, res: express.Response) => {
  res.status(200).end()
}

app
  .getRouter()
  .get(
    '/test/:collectionAddress/:itemId/contents',
    withValidContractAddress('collectionAddress'),
    withValidItemId('itemId'),
    simpleResponseHandler
  )

const server = supertest(app.getApp())

describe('when fetching the item contents', () => {
  describe('when the collection address is invalid', () => {
    it.each(['aCollectionAddress', '0xa', 'null'])(
      'should respond with a 400 and  with a message indicating that the address is not valid',
      async (collectionAddress) => {
        return server
          .get(buildURL(`/test/${collectionAddress}/0/contents`))
          .expect(400)
          .then((response: any) => {
            expect(response.body).toEqual({
              data: {
                contractAddress: collectionAddress,
              },
              error: `Invalid address ${collectionAddress}`,
              ok: false,
            })
          })
      }
    )
  })

  describe('when the item id is invalid', () => {
    beforeEach(() => {
      jest
        .spyOn(ethers.utils, 'isAddress')
        .mockImplementationOnce((_address: string) => true)
    })

    it.each(['aItemId', 'null', 'a'])(
      'should respond with a 400 and a message indicating that the item id is not valid',
      async (blockchainItemId) => {
        return server
          .get(buildURL(`/test/0xa/${blockchainItemId}/contents`))
          .expect(400)
          .then((response: any) => {
            expect(response.body).toEqual({
              data: {
                itemId: blockchainItemId,
              },
              error: `Invalid Item ID ${blockchainItemId}`,
              ok: false,
            })
          })
      }
    )
  })

  describe('when the collection address is valid and the item id is valid', () => {
    beforeEach(() => {
      jest
        .spyOn(ethers.utils, 'isAddress')
        .mockImplementationOnce((_address: string) => true)
    })

    it('should respond with a 200 and the item contents', async () => {
      return server
        .get(buildURL('/test/0xa/1/contents'))
        .expect(200)
        .then((response: any) => {
          expect(response.body).toEqual({})
        })
    })
  })
})
