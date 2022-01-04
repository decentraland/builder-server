import { CurationService } from '.'
import { CollectionAttributes } from '../Collection'
import { getMergedCollection } from '../Collection/utils'
import { getMergedItem } from '../Item/utils'
import { isCommitteeMember } from '../Committee'
import { Ownable } from '../Ownable'
import { CollectionCuration } from './CollectionCuration'
import { ItemCuration } from './ItemCuration'
import { ItemAttributes } from '../Item'

jest.mock('../Committee')
jest.mock('../Collection/utils')
jest.mock('../Item/utils')

const isOwnedBySpy = jest.spyOn(Ownable.prototype, 'isOwnedBy')
const mockIsCommitteeMember = isCommitteeMember as jest.Mock
const mockGetMergedCollection = getMergedCollection as jest.Mock
const mockGetMergedItem = getMergedItem as jest.Mock

describe('when getting the access to an element', () => {
  describe('when checking a collection', () => {
    let service: CurationService<typeof CollectionCuration>
    let collection: CollectionAttributes

    const testHasAccessToCollectionToBe = (hasAccess: boolean) =>
      expect(service.hasAccess('collectionId', 'address')).resolves.toBe(
        hasAccess
      )

    beforeEach(() => {
      service = new CurationService(CollectionCuration)
      collection = { managers: ['address'] } as CollectionAttributes

      mockIsCommitteeMember.mockResolvedValue(false)
      isOwnedBySpy.mockResolvedValue(false)
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    describe('when the address belongs to the committe', () => {
      beforeEach(() => {
        mockIsCommitteeMember.mockResolvedValueOnce(true)
        mockGetMergedCollection.mockResolvedValueOnce(collection)
      })

      it('should resolve to true', () => {
        return testHasAccessToCollectionToBe(true)
      })
    })

    describe('when the collection belongs to the address', () => {
      beforeEach(() => {
        mockGetMergedCollection.mockResolvedValueOnce(collection)
        isOwnedBySpy.mockResolvedValueOnce(true)
      })

      it('should resolve to true', () => {
        return testHasAccessToCollectionToBe(true)
      })
    })

    describe('when the address is a manager of the collection', () => {
      beforeEach(() => {
        mockGetMergedCollection.mockResolvedValueOnce(collection)
      })

      it('should resolve to true', () => {
        return testHasAccessToCollectionToBe(true)
      })
    })

    describe('when the none of the managers of a collection match with the provided address', () => {
      beforeEach(() => {
        collection = { ...collection, managers: ['another address'] }
        mockGetMergedCollection.mockResolvedValueOnce(collection)
      })

      it('should resolve to false', () => {
        return testHasAccessToCollectionToBe(false)
      })
    })
  })

  describe('when checking an item', () => {
    let service: CurationService<typeof ItemCuration>
    let collection: CollectionAttributes
    let item: ItemAttributes

    const testHasAccessToItemToBe = (hasAccess: boolean) =>
      expect(service.hasAccess('itemId', 'address')).resolves.toBe(hasAccess)

    beforeEach(() => {
      service = new CurationService(ItemCuration)
      collection = {
        id: 'some-id',
        managers: ['address'],
      } as CollectionAttributes
      item = { collection_id: collection.id } as ItemAttributes

      mockIsCommitteeMember.mockResolvedValue(false)
      isOwnedBySpy.mockResolvedValue(false)
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    describe('when the address belongs to the committe', () => {
      beforeEach(() => {
        mockIsCommitteeMember.mockResolvedValueOnce(true)
        mockGetMergedItem.mockResolvedValueOnce(item)
      })

      it('should resolve to true', () => {
        return testHasAccessToItemToBe(true)
      })
    })

    describe('when the item belongs to the address', () => {
      beforeEach(() => {
        mockGetMergedItem.mockResolvedValueOnce(collection)
        isOwnedBySpy.mockResolvedValueOnce(true)
      })

      it('should resolve to true', () => {
        return testHasAccessToItemToBe(true)
      })
    })

    describe('when the address is a manager of the collection', () => {
      beforeEach(() => {
        mockGetMergedItem.mockResolvedValueOnce(item)
        mockGetMergedCollection.mockResolvedValueOnce(collection)
      })

      it('should resolve to true', () => {
        return testHasAccessToItemToBe(true)
      })
    })

    describe('when the none of the managers of a collection match with the provided address', () => {
      beforeEach(() => {
        collection = { ...collection, managers: ['another address'] }
        mockGetMergedItem.mockResolvedValueOnce(item)
        mockGetMergedCollection.mockResolvedValueOnce(collection)
      })

      it('should resolve to false', () => {
        return testHasAccessToItemToBe(false)
      })
    })
  })
})
