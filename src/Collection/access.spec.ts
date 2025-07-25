import { wallet } from '../../spec/mocks/wallet'
import {
  dbCollectionMock,
  dbTPCollectionMock,
} from '../../spec/mocks/collections'
import { ThirdPartyService } from '../ThirdParty/ThirdParty.service'
import { Ownable } from '../Ownable'
import { isCommitteeMember } from '../Committee'
import { hasAccess, hasPublicAccess, isAdminUser } from './access'
import { CollectionAttributes } from './Collection.types'

jest.mock('../Committee')
jest.mock('../ethereum/api/thirdParty')
jest.mock('../ThirdParty/ThirdParty.service')

const isOwnedBySpy = jest.spyOn(Ownable.prototype, 'isOwnedBy')
const mockIsCommitteeMember = isCommitteeMember as jest.Mock

describe('when getting the public access for a collection', () => {
  let collection: CollectionAttributes

  describe('when the collection is published', () => {
    beforeEach(() => {
      collection = { ...dbCollectionMock, is_published: true }
    })

    it('should return true if the collection is published', async () => {
      const result = await hasPublicAccess(wallet.address, collection)
      expect(result).toBe(true)
    })
  })
})

describe('when getting access for a collection', () => {
  let collection: CollectionAttributes

  beforeEach(() => {
    collection = { ...dbCollectionMock }
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
      expect(await hasAccess(wallet.address, collection)).toBe(false)
    })
  })

  describe('when the user owns the collection', () => {
    beforeEach(() => {
      isOwnedBySpy.mockResolvedValueOnce(true)
      mockIsCommitteeMember.mockResolvedValueOnce(false)
    })

    it('should return true', async () => {
      expect(await hasAccess(wallet.address, collection)).toBe(true)
    })
  })

  describe('when the user is part of the committee', () => {
    beforeEach(() => {
      isOwnedBySpy.mockResolvedValueOnce(true)
      mockIsCommitteeMember.mockResolvedValueOnce(false)
    })

    it('should return true', async () => {
      expect(await hasAccess(wallet.address, collection)).toBe(true)
    })
  })

  describe('when the collection is standard', () => {
    describe("when the user does not have access and it's not the manager of the collection", () => {
      beforeEach(() => {
        isOwnedBySpy.mockResolvedValueOnce(false)
        mockIsCommitteeMember.mockResolvedValueOnce(false)
        collection = { ...collection, managers: [] }
      })

      it('should return false', async () => {
        expect(await hasAccess(wallet.address, collection)).toBe(false)
      })
    })

    describe("when the user does not have access but it's the manager of the collection", () => {
      beforeEach(() => {
        isOwnedBySpy.mockResolvedValueOnce(false)
        mockIsCommitteeMember.mockResolvedValueOnce(false)
        collection = {
          ...collection,
          managers: [wallet.address],
          is_published: true,
        }
      })

      it('should return true', async () => {
        expect(await hasAccess(wallet.address, collection)).toBe(true)
      })
    })
  })

  describe('when the collection is TP', () => {
    beforeEach(() => {
      collection = { ...dbTPCollectionMock }
    })

    describe("when the user does not have access and it's not the manager of the collection", () => {
      beforeEach(() => {
        isOwnedBySpy.mockResolvedValueOnce(false)
        mockIsCommitteeMember.mockResolvedValueOnce(false)
        ;(ThirdPartyService.isManager as jest.Mock).mockResolvedValueOnce(false)
      })

      it('should return false', async () => {
        expect(await hasAccess(wallet.address, collection)).toBe(false)
      })
    })

    describe("when the user does not have access but it's the manager of the collection", () => {
      beforeEach(() => {
        isOwnedBySpy.mockResolvedValueOnce(false)
        mockIsCommitteeMember.mockResolvedValueOnce(false)
        ;(ThirdPartyService.isManager as jest.Mock).mockResolvedValueOnce(true)
      })

      it('should return true', async () => {
        expect(await hasAccess(wallet.address, collection)).toBe(true)
      })
    })
  })
})

describe('when checking if the user is an admin user', () => {
  beforeEach(() => {
    process.env.ADMIN_ADDRESSES = '0x0'
  })

  it('should return true if the user is an admin user', () => {
    expect(isAdminUser('0x0')).toBe(true)
  })

  it('should return false if the user is not an admin user', () => {
    expect(isAdminUser('0x1')).toBe(false)
  })
})
