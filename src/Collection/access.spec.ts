import { wallet } from '../../spec/mocks/wallet'
import {
  dbCollectionMock,
  dbTPCollectionMock,
} from '../../spec/mocks/collections'
import { ThirdPartyService } from '../ThirdParty/ThirdParty.service'
import { Ownable } from '../Ownable'
import { isCommitteeMember } from '../Committee'
import {
  canSeeCollection,
  hasAccess,
  hasPublicAccess,
  isAdminUser,
  isManager,
  isMinter,
} from './access'
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

describe('when checking if the user is a manager of a collection', () => {
  const lowercased = '0xc6d2000a7a1ddca92941f4e2b41360fe4ee2abd9'
  const checksummed = '0xC6d2000A7a1DdCA92941f4E2b41360Fe4Ee2ABd9'

  it('should match the caller against the managers case-insensitively', () => {
    const collection = { ...dbCollectionMock, managers: [lowercased] }
    expect(isManager(checksummed, collection)).toBe(true)
  })

  it('should return false when the caller is not a manager', () => {
    const collection = { ...dbCollectionMock, managers: [lowercased] }
    expect(
      isManager('0x1111111111111111111111111111111111111111', collection)
    ).toBe(false)
  })
})

describe('when checking if the user is a minter of a collection', () => {
  const lowercased = '0xc6d2000a7a1ddca92941f4e2b41360fe4ee2abd9'
  const checksummed = '0xC6d2000A7a1DdCA92941f4E2b41360Fe4Ee2ABd9'

  it('should match the caller against the minters case-insensitively', () => {
    const collection = { ...dbCollectionMock, minters: [lowercased] }
    expect(isMinter(checksummed, collection)).toBe(true)
  })

  it('should return false when the caller is not a minter', () => {
    const collection = { ...dbCollectionMock, minters: [lowercased] }
    expect(
      isMinter('0x1111111111111111111111111111111111111111', collection)
    ).toBe(false)
  })
})

describe('when checking if the user can see the full collection', () => {
  afterEach(() => {
    jest.resetAllMocks()
    delete process.env.ADMIN_ADDRESSES
  })

  it('should return true for a minter, even without other access', async () => {
    const collection = {
      ...dbCollectionMock,
      minters: [wallet.address],
      managers: [],
      is_published: true,
    }
    expect(await canSeeCollection(wallet.address, collection)).toBe(true)
  })

  it('should return true for an admin user', async () => {
    process.env.ADMIN_ADDRESSES = wallet.address
    const collection = { ...dbCollectionMock, minters: [], managers: [] }
    expect(await canSeeCollection(wallet.address, collection)).toBe(true)
  })

  it('should return false for a caller with no relationship to the collection', async () => {
    isOwnedBySpy.mockResolvedValueOnce(false)
    mockIsCommitteeMember.mockResolvedValueOnce(false)
    const collection = {
      ...dbCollectionMock,
      minters: [],
      managers: [],
      is_published: true,
    }
    expect(await canSeeCollection(wallet.address, collection)).toBe(false)
  })
})
