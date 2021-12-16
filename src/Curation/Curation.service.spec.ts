import { CurationService } from '.'
import { CollectionAttributes } from '../Collection'
import { getMergedCollection } from '../Collection/utils'
import { isCommitteeMember } from '../Committee'
import { Ownable } from '../Ownable'
import { CollectionCuration } from './CollectionCuration'

jest.mock('../Committee')
jest.mock('../Collection/utils')

const mockIsCommitteeMember = isCommitteeMember as jest.Mock
const isOwnedBySpy = jest.spyOn(Ownable.prototype, 'isOwnedBy')
const mockGetMergedCollection = getMergedCollection as jest.Mock

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
      it('should resolve to true', () => {
        mockIsCommitteeMember.mockResolvedValueOnce(true)
        mockGetMergedCollection.mockResolvedValueOnce(collection)
        return testHasAccessToCollectionToBe(true)
      })
    })

    describe('when the collection belongs to the address', () => {
      it('should resolve to true', () => {
        mockGetMergedCollection.mockResolvedValueOnce(collection)
        isOwnedBySpy.mockResolvedValueOnce(true)
        return testHasAccessToCollectionToBe(true)
      })
    })

    describe('when the address is a manager of the collection', () => {
      it('should resolve to true', () => {
        mockGetMergedCollection.mockResolvedValueOnce(collection)
        return testHasAccessToCollectionToBe(true)
      })
    })

    describe('when the none of the managers of a collection match with the provided address', () => {
      it('should resolve to false', () => {
        const collection = { managers: ['another address'] }
        mockGetMergedCollection.mockResolvedValueOnce(collection)
        return testHasAccessToCollectionToBe(false)
      })
    })
  })
})
