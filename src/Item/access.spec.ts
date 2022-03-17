import { dbItemMock } from '../../spec/mocks/items'
import { wallet } from '../../spec/mocks/wallet'
import { Bridge } from '../ethereum/api/Bridge'
import {
  dbCollectionMock,
  dbTPCollectionMock,
} from '../../spec/mocks/collections'
import { CollectionAttributes } from '../Collection'
import { thirdPartyAPI } from '../ethereum/api/thirdParty'
import { isManager as isCollectionManager } from '../Collection/access'
import { Ownable } from '../Ownable'
import { isCommitteeMember } from '../Committee'
import { hasPublicAccess, hasAccess } from './access'
import { FullItem } from './Item.types'

jest.mock('../Committee')
jest.mock('../Collection/access')
jest.mock('../ethereum/api/thirdParty')

const isOwnedBySpy = jest.spyOn(Ownable.prototype, 'isOwnedBy')
const mockIsCommitteeMember = isCommitteeMember as jest.Mock
const mockIsCollectionManager = isCollectionManager as jest.Mock

describe('when getting the public access for an item', () => {
  let item: FullItem

  describe('when the item is published', () => {
    beforeEach(() => {
      item = { ...Bridge.toFullItem(dbItemMock), is_published: true }
    })

    it('should return true if the item is published', async () => {
      expect(await hasPublicAccess(wallet.address, item)).toBe(true)
    })
  })
})

describe('when getting access for an item', () => {
  let item: FullItem
  let collection: CollectionAttributes

  beforeEach(() => {
    item = Bridge.toFullItem(dbItemMock)
    collection = { ...dbCollectionMock, is_published: true }
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when the user does not have access', () => {
    beforeEach(() => {
      isOwnedBySpy.mockResolvedValueOnce(false)
      mockIsCommitteeMember.mockResolvedValueOnce(false)
    })

    it('should return false', async () => {
      expect(await hasAccess(wallet.address, item.id)).toBe(false)
    })
  })

  describe('when the user owns the item', () => {
    beforeEach(() => {
      isOwnedBySpy.mockResolvedValueOnce(true)
      mockIsCommitteeMember.mockResolvedValueOnce(false)
    })

    it('should return true', async () => {
      expect(await hasAccess(wallet.address, item.id)).toBe(true)
    })
  })

  describe('when the user is part of the committee', () => {
    beforeEach(() => {
      isOwnedBySpy.mockResolvedValueOnce(true)
      mockIsCommitteeMember.mockResolvedValueOnce(false)
    })

    it('should return true', async () => {
      expect(await hasAccess(wallet.address, item.id)).toBe(true)
    })
  })

  describe('when supplying the items collection', () => {
    describe('when the collection is standard', () => {
      describe("when the user does not have access and it's not the manager of the collection", () => {
        beforeEach(() => {
          isOwnedBySpy.mockResolvedValueOnce(false)
          mockIsCommitteeMember.mockResolvedValueOnce(false)
          mockIsCollectionManager.mockResolvedValueOnce(false)
        })

        it('should return false', async () => {
          expect(await hasAccess(wallet.address, item.id, collection)).toBe(
            false
          )
        })
      })

      describe("when the user does not have access but it's the manager of the collection", () => {
        beforeEach(() => {
          isOwnedBySpy.mockResolvedValueOnce(false)
          mockIsCommitteeMember.mockResolvedValueOnce(false)
          mockIsCollectionManager.mockResolvedValueOnce(true)
        })

        it('should return true', async () => {
          expect(await hasAccess(wallet.address, item.id, collection)).toBe(
            true
          )
        })
      })
    })

    describe('when the collection is TP', () => {
      describe("when the user does not have access and it's not the manager of the collection", () => {
        beforeEach(() => {
          isOwnedBySpy.mockResolvedValueOnce(false)
          mockIsCommitteeMember.mockResolvedValueOnce(false)
          ;(thirdPartyAPI.isManager as jest.Mock).mockResolvedValueOnce(false)
        })

        it('should return false', async () => {
          expect(
            await hasAccess(wallet.address, item.id, dbTPCollectionMock)
          ).toBe(false)
        })
      })

      describe("when the user does not have access but it's the manager of the collection", () => {
        beforeEach(() => {
          isOwnedBySpy.mockResolvedValueOnce(false)
          mockIsCommitteeMember.mockResolvedValueOnce(false)
          ;(thirdPartyAPI.isManager as jest.Mock).mockResolvedValueOnce(true)
        })

        it('should return true', async () => {
          expect(
            await hasAccess(wallet.address, item.id, dbTPCollectionMock)
          ).toBe(true)
        })
      })
    })
  })
})
