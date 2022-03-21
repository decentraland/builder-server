import { dbCollectionMock } from '../../spec/mocks/collections'
import { dbItemMock } from '../../spec/mocks/items'
import { CollectionAttributes } from '../Collection/Collection.types'
import { ItemAttributes } from '../Item/Item.types'
import { isStandardItemPublished } from './utils'

describe('when checking if an item is published', () => {
  let item: ItemAttributes
  let collection: CollectionAttributes

  beforeEach(() => {
    collection = { ...dbCollectionMock }
    item = { ...dbItemMock, collection_id: dbCollectionMock.id }
  })

  describe("and the item doesn't have a blockchain item id", () => {
    beforeEach(() => {
      item.blockchain_item_id = null
    })

    it('should return false', () => {
      expect(isStandardItemPublished(item, collection)).toBe(false)
    })
  })

  describe("and the item's collection doesn't have a contract address", () => {
    beforeEach(() => {
      collection.contract_address = null
    })

    it('should return false', () => {
      expect(isStandardItemPublished(item, collection)).toBe(false)
    })
  })

  describe('and the item has a blockchain item id and the collection has a contract address', () => {
    beforeEach(() => {
      item.blockchain_item_id = '20'
      collection.contract_address = '0x123'
    })

    it('should return true', () => {
      expect(isStandardItemPublished(item, collection)).toBe(true)
    })
  })
})
