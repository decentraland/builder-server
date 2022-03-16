import { CurationService } from './Curation.service'
import { CollectionAttributes, Collection } from '../Collection'
import { isCommitteeMember } from '../Committee'
import { getMergedCollection } from '../Collection/utils'
import { Ownable } from '../Ownable'
import { CollectionCuration } from './CollectionCuration'
import { ItemCuration } from './ItemCuration'

jest.mock('../Committee')
jest.mock('../Collection/Collection.model')

const isOwnedBySpy = jest.spyOn(Ownable.prototype, 'isOwnedBy')
const mockIsCommitteeMember = isCommitteeMember as jest.Mock
const mockFindCollectionOwningItem = Collection.findCollectionOwningItem as jest.Mock
let mockGetMergedCollection: jest.Mock

describe('when getting the access to an element', () => {
  beforeEach(() => {
    mockGetMergedCollection = getMergedCollection as jest.Mock
  })

  describe('when checking a collection', () => {
    let service: CurationService<typeof CollectionCuration>
    let collection: CollectionAttributes
    let publishedCollection: CollectionAttributes

    const testHasAccessToCollectionToBe = (hasAccess: boolean) =>
      expect(service.hasAccess('collectionId', 'address')).resolves.toBe(
        hasAccess
      )

    beforeEach(() => {
      service = new CurationService(CollectionCuration)
      collection = { id: 'aCollectionId' } as CollectionAttributes
      publishedCollection = {
        ...collection,
        managers: ['address'],
      } as CollectionAttributes

      mockIsCommitteeMember.mockResolvedValue(false)
      isOwnedBySpy.mockResolvedValue(false)
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    describe('when the address belongs to the committee', () => {
      beforeEach(() => {
        mockIsCommitteeMember.mockResolvedValueOnce(true)
        mockFindCollectionOwningItem.mockResolvedValueOnce(collection)
        mockGetMergedCollection.mockResolvedValueOnce(publishedCollection)
      })

      it('should resolve to true', () => {
        return testHasAccessToCollectionToBe(true)
      })
    })

    describe('when the collection belongs to the address', () => {
      beforeEach(() => {
        mockFindCollectionOwningItem.mockResolvedValueOnce(collection)
        mockGetMergedCollection.mockResolvedValueOnce(publishedCollection)
        isOwnedBySpy.mockResolvedValueOnce(true)
      })

      it('should resolve to true', () => {
        return testHasAccessToCollectionToBe(true)
      })
    })

    describe('when the address is a manager of the collection', () => {
      beforeEach(() => {
        mockFindCollectionOwningItem.mockResolvedValueOnce(collection)
        mockGetMergedCollection.mockResolvedValueOnce(publishedCollection)
      })

      it('should resolve to true', () => {
        return testHasAccessToCollectionToBe(true)
      })
    })

    describe('when the none of the managers of a collection match with the provided address', () => {
      beforeEach(() => {
        publishedCollection = {
          ...publishedCollection,
          managers: ['another address'],
        }
        mockFindCollectionOwningItem.mockResolvedValueOnce(collection)
        mockGetMergedCollection.mockResolvedValueOnce(publishedCollection)
      })

      it('should resolve to false', () => {
        return testHasAccessToCollectionToBe(false)
      })
    })
  })

  describe('when checking an item', () => {
    let service: CurationService<typeof ItemCuration>
    let collection: CollectionAttributes

    const testHasAccessToItemToBe = (hasAccess: boolean) =>
      expect(service.hasAccess('itemId', 'address')).resolves.toBe(hasAccess)

    beforeEach(() => {
      service = new CurationService(ItemCuration)
      collection = {
        id: 'some-id',
        managers: ['address'],
      } as CollectionAttributes

      mockIsCommitteeMember.mockResolvedValue(false)
      isOwnedBySpy.mockResolvedValue(false)
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    describe('when the address belongs to the committee', () => {
      beforeEach(() => {
        mockIsCommitteeMember.mockResolvedValueOnce(true)
        mockFindCollectionOwningItem.mockResolvedValueOnce({
          ...collection,
          managers: ['address'],
        })
      })

      it('should resolve to true', () => {
        return testHasAccessToItemToBe(true)
      })
    })

    describe('when the item belongs to the address', () => {
      beforeEach(() => {
        mockFindCollectionOwningItem.mockResolvedValueOnce(collection)
        isOwnedBySpy.mockResolvedValueOnce(true)
      })

      it('should resolve to true', () => {
        return testHasAccessToItemToBe(true)
      })
    })

    describe('when the address is a manager of the collection', () => {
      beforeEach(() => {
        mockFindCollectionOwningItem.mockResolvedValueOnce(collection)
      })

      it('should resolve to true', () => {
        return testHasAccessToItemToBe(true)
      })
    })

    describe('when the none of the managers of a collection match with the provided address', () => {
      beforeEach(() => {
        collection = { ...collection, managers: ['another address'] }
        mockFindCollectionOwningItem.mockResolvedValueOnce(collection)
      })

      it('should resolve to false', () => {
        return testHasAccessToItemToBe(false)
      })
    })
  })
})
