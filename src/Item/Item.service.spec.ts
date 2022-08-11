import { dbItemMock } from '../../spec/mocks/items'
import { Item } from './Item.model'
import { ItemService } from './Item.service'
import { ItemAttributes } from './Item.types'

jest.mock('./Item.model')

describe('Item Service', () => {
  let dbItem: ItemAttributes
  describe('isOwnedOrManagedBy', () => {
    const service = new ItemService()
    beforeEach(() => {
      dbItem = { ...dbItemMock, eth_address: '0xoriginalAddress' }
      ;(Item.findOne as jest.Mock).mockResolvedValueOnce(dbItem)
    })

    it('should return true when the owner is the sender', async () => {
      expect(
        await service.isOwnedOrManagedBy(dbItem.id, '0xoriginalAddress')
      ).toBe(true)
    })

    it('should return false when  the sender is not the owner', async () => {
      expect(
        await service.isOwnedOrManagedBy(dbItem.id, '0xanotherAddress')
      ).toBe(false)
    })
  })
})
