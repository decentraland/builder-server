import { constants } from 'ethers'
import {
  dbItemMock,
  dbTPItemMock,
  itemFragmentMock,
  thirdPartyItemFragmentMock,
} from '../../spec/mocks/items'
import { collectionAPI } from '../ethereum/api/collection'
import { peerAPI } from '../ethereum/api/peer'
import {
  collectionFragmentMock,
  dbCollectionMock,
  dbTPCollectionMock,
} from '../../spec/mocks/collections'
import { tpWearableMock } from '../../spec/mocks/peer'
import { Collection, CollectionAttributes } from '../Collection'
import { NonExistentCollectionError } from '../Collection/Collection.errors'
import { NonExistentItemError, UnpublishedItemError } from './Item.errors'
import { ItemAttributes } from './Item.types'
import { Item } from './Item.model'
import { getMergedItem } from './utils'
import { thirdPartyAPI } from '../ethereum/api/thirdParty'
import { Bridge } from '../ethereum/api/Bridge'

describe('getMergedItem', () => {
  let item: ItemAttributes
  let collection: CollectionAttributes

  describe('when the db item can not be found', () => {
    beforeEach(() => {
      jest.spyOn(Item, 'findOne').mockResolvedValueOnce(undefined)
    })

    it('should throw a non existent item error', async () => {
      return expect(getMergedItem('id')).rejects.toEqual(
        new NonExistentItemError('id')
      )
    })
  })

  describe('when the db collection can not be found', () => {
    beforeEach(() => {
      jest.spyOn(Item, 'findOne').mockResolvedValueOnce({})
      jest.spyOn(Collection, 'findOne').mockResolvedValueOnce(undefined)
    })

    it('should throw a non existent item error', async () => {
      return expect(getMergedItem('id')).rejects.toEqual(
        new NonExistentCollectionError('id')
      )
    })
  })

  describe('when the item is a dcl item', () => {
    beforeEach(() => {
      item = {
        ...dbItemMock,
      } as ItemAttributes
      collection = {
        ...dbCollectionMock,
      } as CollectionAttributes
    })

    describe('when the remote collection can not be found', () => {
      beforeEach(() => {
        jest.spyOn(Item, 'findOne').mockResolvedValueOnce(item)
        jest.spyOn(Collection, 'findOne').mockResolvedValueOnce(collection)

        jest
          .spyOn(collectionAPI, 'fetchCollectionWithItem')
          .mockResolvedValueOnce({ collection: null, item: itemFragmentMock })
      })

      it('should throw an unpublished item error', async () => {
        return expect(getMergedItem(item.id)).rejects.toEqual(
          new UnpublishedItemError(item.id)
        )
      })
    })

    describe('when the remote item can not be found', () => {
      beforeEach(() => {
        jest.spyOn(Item, 'findOne').mockResolvedValueOnce(item)
        jest.spyOn(Collection, 'findOne').mockResolvedValueOnce(collection)

        jest
          .spyOn(collectionAPI, 'fetchCollectionWithItem')
          .mockResolvedValueOnce({
            collection: collectionFragmentMock,
            item: null,
          })
      })

      it('should throw an unpublished item error', async () => {
        return expect(getMergedItem(item.id)).rejects.toEqual(
          new UnpublishedItemError(item.id)
        )
      })
    })

    describe('when the remote and db data are available', () => {
      beforeEach(() => {
        jest.spyOn(Item, 'findOne').mockResolvedValueOnce(item)
        jest.spyOn(Collection, 'findOne').mockResolvedValueOnce(collection)

        jest
          .spyOn(collectionAPI, 'fetchCollectionWithItem')
          .mockResolvedValueOnce({
            collection: collectionFragmentMock,
            item: itemFragmentMock,
          })
      })

      it('should return the merged item', async () => {
        expect(await getMergedItem(item.id)).toEqual({
          ...Bridge.toFullItem(item),
          is_published: true,
          urn: itemFragmentMock.urn,
          beneficiary: itemFragmentMock.beneficiary,
          total_supply: +itemFragmentMock.totalSupply,
          data: { ...item.data, category: undefined },
        })
      })
    })
  })

  describe('when the item is a third party item', () => {
    beforeEach(() => {
      item = {
        ...dbTPItemMock,
      } as ItemAttributes
      collection = {
        ...dbTPCollectionMock,
      } as CollectionAttributes
    })

    describe('when the remote item can not be found', () => {
      beforeEach(() => {
        jest.spyOn(Item, 'findOne').mockResolvedValueOnce(item)
        jest.spyOn(Collection, 'findOne').mockResolvedValueOnce(collection)

        jest.spyOn(thirdPartyAPI, 'fetchItem').mockResolvedValueOnce(undefined)
      })

      it('should throw an unpublished item error', async () => {
        return expect(getMergedItem(item.id)).rejects.toEqual(
          new UnpublishedItemError(item.id)
        )
      })
    })

    describe('when the remote and db data are available', () => {
      beforeEach(() => {
        jest.spyOn(Item, 'findOne').mockResolvedValueOnce(item)
        jest.spyOn(Collection, 'findOne').mockResolvedValueOnce(collection)

        jest
          .spyOn(peerAPI, 'fetchWearables')
          .mockResolvedValueOnce([tpWearableMock])
      })

      it('should return the merged item', async () => {
        expect(await getMergedItem(item.id)).toEqual({
          ...Bridge.toFullItem(item),
          in_catalyst: true,
          is_published: true,
          is_approved: thirdPartyItemFragmentMock.isApproved,
          blockchain_item_id: thirdPartyItemFragmentMock.blockchainItemId,
          urn: thirdPartyItemFragmentMock.urn,
          content_hash: '',
          price: '0',
          beneficiary: constants.AddressZero,
          data: { ...item.data, category: undefined },
        })
      })
    })
  })
})
