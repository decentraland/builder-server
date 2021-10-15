import { getMergedCollection } from '../Collection/utils'
import { isCommitteeMember } from '../Committee'
import { Ownable } from '../Ownable'
import { hasAccessToCollection } from './access'

jest.mock('../Committee')
jest.mock('../Collection/utils')

const mockIsCommitteeMember = isCommitteeMember as jest.Mock
const isOwnedBySpy = jest.spyOn(Ownable.prototype, 'isOwnedBy')
const mockGetMergedCollection = getMergedCollection as jest.Mock

describe('hasAccessToCollection', () => {
  beforeAll(() => {
    mockIsCommitteeMember.mockResolvedValue(false)
    isOwnedBySpy.mockResolvedValue(false)
  })

  const testHasAccessToCollection = (resolves: boolean) =>
    expect(hasAccessToCollection('address', 'collectionId')).resolves.toBe(
      resolves
    )

  describe('when the address belongs to the committe', () => {
    it('should resolve to true', async () => {
      mockIsCommitteeMember.mockResolvedValueOnce(true)

      testHasAccessToCollection(true)
    })
  })

  describe('when the collection belongs to the address', () => {
    it('should resolve to true', async () => {
      isOwnedBySpy.mockResolvedValueOnce(true)

      testHasAccessToCollection(true)
    })
  })

  describe('when the address is a manager of the collection', () => {
    it('should resolve to true', async () => {
      mockGetMergedCollection.mockResolvedValueOnce({
        collection: { managers: ['address'] },
      })

      testHasAccessToCollection(true)
    })
  })

  describe('when the collection for checking if address is manager is undefined', () => {
    it('should resolve to false', async () => {
      mockGetMergedCollection.mockResolvedValueOnce({})

      testHasAccessToCollection(false)
    })
  })

  describe('when the none of the managers of a collection match with the provided address', () => {
    it('should resolve to false', async () => {
      mockGetMergedCollection.mockResolvedValueOnce({
        collection: { managers: ['another address'] },
      })

      testHasAccessToCollection(false)
    })
  })
})
