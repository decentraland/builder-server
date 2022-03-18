import { CurationService } from './Curation.service'
import { CollectionAttributes, Collection } from '../Collection'
import { isCommitteeMember } from '../Committee'
import { getMergedCollection } from '../Collection/utils'
import { Ownable } from '../Ownable'
import { CollectionCuration } from './CollectionCuration'
import { ItemCuration } from './ItemCuration'

jest.mock('../Committee')
jest.mock('../Collection/Collection.model')
jest.mock('../Collection/utils')

const isOwnedBySpy = jest.spyOn(Ownable.prototype, 'isOwnedBy')
const mockIsCommitteeMember = isCommitteeMember as jest.Mock
const mockFindOneCollection = Collection.findOne as jest.Mock
const mockFindCollectionByItemId = Collection.findByItemId as jest.Mock
const mockGetMergedCollection = getMergedCollection as jest.Mock

describe('when getting the access to an element', () => {
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
        is_published: true,
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
        mockFindOneCollection.mockResolvedValueOnce(collection)
        mockGetMergedCollection.mockResolvedValueOnce(publishedCollection)
      })

      it('should resolve to true', () => {
        return testHasAccessToCollectionToBe(true)
      })
    })

    describe('when the collection belongs to the address', () => {
      beforeEach(() => {
        mockFindOneCollection.mockResolvedValueOnce(collection)
        mockGetMergedCollection.mockResolvedValueOnce(publishedCollection)
        isOwnedBySpy.mockResolvedValueOnce(true)
      })

      it('should resolve to true', () => {
        return testHasAccessToCollectionToBe(true)
      })
    })

    describe('when the address is a manager of the collection', () => {
      beforeEach(() => {
        mockIsCommitteeMember.mockResolvedValueOnce(false)
        mockFindOneCollection.mockResolvedValueOnce(collection)
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
        mockIsCommitteeMember.mockResolvedValueOnce(false)
        mockFindOneCollection.mockResolvedValueOnce(collection)
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
    let publishedCollection: CollectionAttributes

    const testHasAccessToItemToBe = (hasAccess: boolean) =>
      expect(service.hasAccess('itemId', 'address')).resolves.toBe(hasAccess)

    beforeEach(() => {
      service = new CurationService(ItemCuration)
      collection = {
        id: 'some-id',
        managers: ['address'],
      } as CollectionAttributes
      publishedCollection = {
        ...collection,
        is_published: true,
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
        mockFindCollectionByItemId.mockResolvedValueOnce(collection)
        mockGetMergedCollection.mockResolvedValueOnce(publishedCollection)
      })

      it('should resolve to true', () => {
        return testHasAccessToItemToBe(true)
      })
    })

    describe('when the item belongs to the address', () => {
      beforeEach(() => {
        mockIsCommitteeMember.mockResolvedValueOnce(false)
        mockFindCollectionByItemId.mockResolvedValueOnce(collection)
        mockGetMergedCollection.mockResolvedValueOnce(publishedCollection)
        isOwnedBySpy.mockResolvedValueOnce(true)
      })

      it('should resolve to true', () => {
        return testHasAccessToItemToBe(true)
      })
    })

    describe('when the address is a manager of the collection', () => {
      beforeEach(() => {
        mockIsCommitteeMember.mockResolvedValueOnce(false)
        mockFindCollectionByItemId.mockResolvedValueOnce(collection)
        mockGetMergedCollection.mockResolvedValueOnce(publishedCollection)
      })

      it('should resolve to true', () => {
        return testHasAccessToItemToBe(true)
      })
    })

    describe('when the none of the managers of a collection match with the provided address', () => {
      beforeEach(() => {
        publishedCollection = {
          ...publishedCollection,
          managers: ['another address'],
        }
        mockIsCommitteeMember.mockResolvedValueOnce(false)
        mockFindCollectionByItemId.mockResolvedValueOnce(collection)
        mockGetMergedCollection.mockResolvedValueOnce(publishedCollection)
      })

      it('should resolve to false', () => {
        return testHasAccessToItemToBe(false)
      })
    })
  })
})
