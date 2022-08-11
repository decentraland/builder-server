import { dbItemMock } from '../../spec/mocks/items'
import { Item } from './Item.model'
import { ItemService } from './Item.service'
import { ItemAttributes } from './Item.types'

jest.mock('./Item.model')

describe('Item Service', () => {
  let dbItem: ItemAttributes
  describe('isOwnedOrManagedBy', () => {
    let service: ItemService
    beforeEach(() => {
      service = new ItemService()
    })

    describe('when the owner is the same as the one in the DB', () => {
      beforeEach(() => {
        dbItem = { ...dbItemMock, eth_address: '0xoriginalAddress' }
        ;(Item.findOne as jest.Mock).mockResolvedValueOnce(dbItem)
      })

      it('should return true', async () => {
        expect(
          await service.isOwnedOrManagedBy(dbItem.id, '0xoriginalAddress')
        ).toBe(true)
      })
    })

    describe('when the owner is not the same as the one in the DB', () => {
      beforeEach(() => {
        dbItem = { ...dbItemMock, eth_address: '0xanotherAddress' }
        ;(Item.findOne as jest.Mock).mockResolvedValueOnce(dbItem)
      })

      it('should return false', async () => {
        expect(
          await service.isOwnedOrManagedBy(dbItem.id, '0xoriginalAddress')
        ).toBe(false)
      })
    })
  })
})
