import { SQL } from 'decentraland-server'
import { Collection } from './Collection.model'
import { CollectionSort, CollectionStatus } from './Collection.types'

describe('Collection model', () => {
  let queryMock: jest.SpyInstance

  beforeEach(() => {
    queryMock = jest.spyOn(Collection, 'query').mockResolvedValue([])
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  function lastQuery(): ReturnType<typeof SQL> {
    return queryMock.mock.calls[queryMock.mock.calls.length - 1][0]
  }

  describe('when building the status statement', () => {
    it('should resolve third party, draft, rejected, approved, disabled and under review in that order', () => {
      const { text } = Collection.getStatusStatement({})
      const branches = [
        'third_party_id IS NOT NULL THEN NULL',
        "THEN 'draft'",
        "THEN 'rejected'",
        "THEN 'under_review' ELSE 'published'",
        "THEN 'disabled'",
        "ELSE 'under_review'\n",
      ].map((branch) => text.indexOf(branch))

      expect(branches.every((index) => index >= 0)).toBe(true)
      expect([...branches].sort((a, b) => a - b)).toEqual(branches)
    })

    it('should only read a not approved collection as disabled with an approved curation or without one', () => {
      const { text } = Collection.getStatusStatement({})
      const disabledBranch = text.slice(
        text.indexOf("ELSE 'published' END"),
        text.indexOf("THEN 'disabled'")
      )

      expect(disabledBranch).toContain(
        "collection_curations.status = 'approved'"
      )
      expect(disabledBranch).toContain('collection_curations.id IS NULL')
    })

    it('should bind the remote ids', () => {
      const { values } = Collection.getStatusStatement({
        remoteIds: ['remote'],
        approvedRemoteIds: ['approved'],
        reviewedRemoteIds: ['reviewed'],
      })

      expect(values).toEqual([['remote'], ['approved'], ['reviewed']])
    })
  })

  describe('when finding collections filtered by status', () => {
    it('should compare the status statement with the status as a bound value', async () => {
      await Collection.findAll({ collectionStatus: CollectionStatus.DISABLED })

      expect(lastQuery().text).toMatch(/END\) = \$\d+/)
      expect(lastQuery().values).toContain(CollectionStatus.DISABLED)
    })
  })

  describe.each([
    [CollectionSort.LAST_ACTIVITY_DESC, 'DESC'],
    [CollectionSort.LAST_ACTIVITY_ASC, 'ASC'],
  ])('when sorting by %s', (sort, direction) => {
    it(`should order by the latest collection, item or curation change ${direction}, breaking ties by id`, async () => {
      await Collection.findAll({ sort })

      expect(lastQuery().text).toMatch(
        new RegExp(
          `ORDER BY GREATEST\\([\\s\\S]*\\) ${direction}, collections.id`
        )
      )
    })
  })

  describe('when counting the collections by status', () => {
    beforeEach(() => {
      queryMock.mockResolvedValueOnce([
        { status: CollectionStatus.DRAFT, count: '2' },
        { status: CollectionStatus.REJECTED, count: '1' },
      ])
    })

    it('should return every status, with zero for the ones without collections', async () => {
      expect(await Collection.countByStatus({})).toEqual({
        [CollectionStatus.DRAFT]: 2,
        [CollectionStatus.UNDER_REVIEW]: 0,
        [CollectionStatus.PUBLISHED]: 0,
        [CollectionStatus.REJECTED]: 1,
        [CollectionStatus.DISABLED]: 0,
      })
    })

    it('should ignore the status filter and leave out collections without a status', async () => {
      await Collection.countByStatus({
        collectionStatus: CollectionStatus.REJECTED,
      })

      expect(lastQuery().text).toContain(
        'WHERE status IS NOT NULL GROUP BY status'
      )
      expect(lastQuery().values).not.toContain(CollectionStatus.REJECTED)
    })

    it('should read from the same published collections as the list when filtering by them', async () => {
      await Collection.countByStatus({ isPublished: true })

      expect(lastQuery().text).toContain('items.blockchain_item_id is NOT NULL')
    })
  })
})
