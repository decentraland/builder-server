import { SQL } from 'decentraland-server'
import { Collection } from './Collection.model'
import { CurationStatusFilter, UNASSIGNED_FILTER } from '../Curation'
import {
  CollectionSort,
  CollectionStatus,
  ReviewTypeFilter,
} from './Collection.types'

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

  // Compares SQL ignoring whitespace, so reformatting a statement doesn't fail the specs.
  function normalize(text: string): string {
    return text.replace(/\s+/g, ' ').trim()
  }

  describe('when building the status statement', () => {
    let statusStatement: string

    beforeEach(() => {
      statusStatement = normalize(Collection.getStatusStatement({}).text)
    })

    it('should resolve third party, draft, rejected, approved, disabled and under review in that order', () => {
      const branches = [
        'WHEN collections.third_party_id IS NOT NULL THEN NULL',
        "WHEN NOT COALESCE(collections.contract_address = ANY($1), false) THEN 'draft'",
        "WHEN collection_curations.status = 'rejected' THEN 'rejected'",
        "WHEN collections.contract_address = ANY($2) THEN CASE WHEN collection_curations.status = 'pending' THEN 'under_review' ELSE 'published' END",
        "THEN 'disabled'",
        "ELSE 'under_review' END",
      ].map((branch) => statusStatement.indexOf(branch))

      expect(branches.every((index) => index >= 0)).toBe(true)
      expect([...branches].sort((a, b) => a - b)).toEqual(branches)
    })

    it('should only read a not approved collection as disabled with an approved curation, or without a curation and reviewed on-chain', () => {
      expect(statusStatement).toContain(
        "WHEN collection_curations.status = 'approved' OR (collection_curations.id IS NULL AND collections.contract_address = ANY($3)) THEN 'disabled'"
      )
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

      expect(normalize(lastQuery().text)).toMatch(/END\) = \$\d+/)
      expect(lastQuery().values).toContain(CollectionStatus.DISABLED)
    })
  })

  describe('when finding collections for the committee', () => {
    const remoteSets = {
      remoteIds: ['approved', 'reviewed', 'new'],
      approvedRemoteIds: ['approved'],
      reviewedRemoteIds: ['reviewed'],
    }

    describe('filtered by several statuses', () => {
      it('should match any of them', async () => {
        await Collection.findAll({
          ...remoteSets,
          statuses: [
            CurationStatusFilter.TO_REVIEW,
            CurationStatusFilter.UNDER_REVIEW,
          ],
        })

        expect(normalize(lastQuery().text)).toMatch(
          /WHERE \(\(\(collection_curations.assignee is NULL AND .* OR \(collection_curations.assignee is NOT NULL AND \(collection_curations.status = \$\d+ OR \(\(collections.third_party_id is NOT NULL AND collections.urn_suffix is NOT NULL\) AND EXISTS \(SELECT 1 FROM item_curations .*\)\)\)\)\)/
        )
      })
    })

    describe('filtered by the to review status', () => {
      it('should take unassigned pending requests whatever the on-chain state, and unassigned never-reviewed collections', async () => {
        await Collection.findAll({
          ...remoteSets,
          statuses: [CurationStatusFilter.TO_REVIEW],
        })

        expect(normalize(lastQuery().text)).toContain(
          'collection_curations.assignee is NULL AND (((collections.third_party_id is NOT NULL AND collections.urn_suffix is NOT NULL) AND ((collection_curations.status = $1 OR collection_curations.id is NULL) OR EXISTS (SELECT 1 FROM item_curations pending_item_curations JOIN items pending_items ON pending_items.id = pending_item_curations.item_id WHERE pending_items.collection_id = collections.id AND pending_item_curations.status = $2))) OR (collections.third_party_id is NULL AND collections.urn_suffix is NULL AND COALESCE(collections.contract_address = ANY($3), false) AND (collection_curations.status = $4 OR (collection_curations.id is NULL AND NOT COALESCE(collections.contract_address = ANY($5), false) AND NOT COALESCE(collections.contract_address = ANY($6), false)))))'
        )
        expect(lastQuery().values.slice(0, 6)).toEqual([
          CurationStatusFilter.PENDING,
          CurationStatusFilter.PENDING,
          remoteSets.remoteIds,
          CurationStatusFilter.PENDING,
          remoteSets.approvedRemoteIds,
          remoteSets.reviewedRemoteIds,
        ])
      })

      it('should take a third-party collection with a pending request, none, or items waiting for review, but not one whose request was decided', async () => {
        await Collection.findAll({
          ...remoteSets,
          statuses: [CurationStatusFilter.TO_REVIEW],
        })

        // A third-party publish keeps the collection's request and opens pending item requests instead.
        expect(normalize(lastQuery().text)).toMatch(
          /urn_suffix is NOT NULL\) AND \(\(collection_curations.status = \$1 OR collection_curations.id is NULL\) OR EXISTS \(SELECT 1 FROM item_curations/
        )
      })
    })

    describe('filtered by the under review status', () => {
      it('should take an assigned pending request, or an assigned third-party collection with items waiting for review', async () => {
        await Collection.findAll({
          ...remoteSets,
          statuses: [CurationStatusFilter.UNDER_REVIEW],
        })

        expect(normalize(lastQuery().text)).toContain(
          'WHERE (((collection_curations.assignee is NOT NULL AND (collection_curations.status = $1 OR ((collections.third_party_id is NOT NULL AND collections.urn_suffix is NOT NULL) AND EXISTS (SELECT 1 FROM item_curations'
        )
      })
    })

    describe('filtered by the rejected status', () => {
      it('should take a rejected request whether or not the collection is approved on chain', async () => {
        await Collection.findAll({
          ...remoteSets,
          statuses: [CurationStatusFilter.REJECTED],
        })

        expect(normalize(lastQuery().text)).toContain(
          'WHERE (((collection_curations.status = $1 AND (COALESCE(collections.contract_address = ANY($2), false) OR (collections.third_party_id is NOT NULL AND collections.urn_suffix is NOT NULL)))))'
        )
        expect(lastQuery().values[0]).toEqual(CurationStatusFilter.REJECTED)
      })
    })

    describe('filtered by the disabled status', () => {
      it('should take a not approved collection with an approved request, or none and reviewed on chain', async () => {
        await Collection.findAll({
          ...remoteSets,
          statuses: [CurationStatusFilter.DISABLED],
        })

        expect(normalize(lastQuery().text)).toContain(
          'WHERE ((((COALESCE(collections.contract_address = ANY($1), false) AND NOT COALESCE(collections.contract_address = ANY($2), false)) AND (collection_curations.status = $3 OR (collection_curations.id is NULL AND COALESCE(collections.contract_address = ANY($4), false))))))'
        )
      })
    })

    describe('filtered by assignees', () => {
      it('should match any of the curators', async () => {
        await Collection.findAll({ ...remoteSets, assignees: ['0xa', '0xb'] })

        expect(normalize(lastQuery().text)).toContain(
          'WHERE ((collection_curations.assignee = ANY($1)))'
        )
        expect(lastQuery().values[0]).toEqual(['0xa', '0xb'])
      })

      it('should match the unassigned collections too when asked', async () => {
        await Collection.findAll({
          ...remoteSets,
          assignees: ['0xa', UNASSIGNED_FILTER],
        })

        expect(normalize(lastQuery().text)).toContain(
          'WHERE ((collection_curations.assignee = ANY($1) OR collection_curations.assignee is NULL))'
        )
        expect(lastQuery().values[0]).toEqual(['0xa'])
      })

      it('should match only the unassigned collections when that is the only assignee', async () => {
        await Collection.findAll({
          ...remoteSets,
          assignees: [UNASSIGNED_FILTER],
        })

        expect(normalize(lastQuery().text)).toContain(
          'WHERE ((collection_curations.assignee is NULL))'
        )
      })
    })

    describe('filtered by review type', () => {
      it('should take the collections approved or reviewed on chain as updates', async () => {
        await Collection.findAll({
          ...remoteSets,
          reviewType: ReviewTypeFilter.UPDATES,
        })

        // COALESCE: a NULL contract address (third-party, unpublished) must read as false, not NULL, on both sides.
        expect(normalize(lastQuery().text)).toContain(
          'WHERE ((COALESCE(collections.contract_address = ANY($1), false) OR COALESCE(collections.contract_address = ANY($2), false)))'
        )
        expect(lastQuery().values.slice(0, 2)).toEqual([
          remoteSets.approvedRemoteIds,
          remoteSets.reviewedRemoteIds,
        ])
      })

      it('should take the rest as new', async () => {
        await Collection.findAll({
          ...remoteSets,
          reviewType: ReviewTypeFilter.NEW,
        })

        expect(normalize(lastQuery().text)).toContain(
          'WHERE (NOT (COALESCE(collections.contract_address = ANY($1), false) OR COALESCE(collections.contract_address = ANY($2), false)))'
        )
      })
    })

    describe('sorted by relevance', () => {
      it('should put the collections to review first, by the same rule as the filter', async () => {
        await Collection.findAll({
          ...remoteSets,
          sort: CollectionSort.MOST_RELEVANT,
        })

        const text = normalize(lastQuery().text)
        const [tier0] = text.split('THEN 0')
        expect(tier0).toContain(
          'ORDER BY CASE WHEN (collection_curations.assignee is NULL AND (((collections.third_party_id is NOT NULL'
        )
        expect(tier0).toContain(
          'NOT COALESCE(collections.contract_address = ANY('
        )
        const [tier1] = text.split('THEN 0')[1].split('THEN 1')
        expect(tier1).toContain(
          'WHEN (collection_curations.assignee is NOT NULL AND (collection_curations.status = $'
        )
        expect(tier1).toContain('EXISTS (SELECT 1 FROM item_curations')
        expect(text).toContain(
          'END, collections.created_at DESC, collections.id'
        )
      })
    })
  })

  describe('when finding collections by contract address', () => {
    it('should match the contract address regardless of its case', async () => {
      await Collection.findAll({
        address: '0xowner',
        contractAddress: '0xAbC',
      })

      expect(normalize(lastQuery().text)).toMatch(
        /LOWER\(collections.contract_address\) = \$\d+/
      )
      expect(lastQuery().values).toContain('0xabc')
    })
  })

  describe.each([
    [CollectionSort.LAST_ACTIVITY_DESC, 'DESC'],
    [CollectionSort.LAST_ACTIVITY_ASC, 'ASC'],
  ])('when sorting by %s', (sort, direction) => {
    it(`should order by the latest collection, item or curation change ${direction}, breaking ties by id`, async () => {
      await Collection.findAll({ sort })

      expect(normalize(lastQuery().text)).toMatch(
        new RegExp(`ORDER BY GREATEST\\(.*\\) ${direction}, collections.id`)
      )
    })
  })

  describe.each([
    [CollectionSort.REQUESTED_AT_DESC, 'DESC'],
    [CollectionSort.REQUESTED_AT_ASC, 'ASC'],
  ])('when sorting by %s', (sort, direction) => {
    it(`should order by the latest request's creation, or the collection's without one, ${direction}`, async () => {
      await Collection.findAll({ sort })

      // The newest pending item request wins, then the newest item request of any status (third-party publishes
      // reuse the collection's request), then the collection's request, then its creation.
      expect(normalize(lastQuery().text)).toContain(
        `ORDER BY COALESCE((SELECT MAX(item_curations.created_at) FROM item_curations item_curations JOIN items items ON items.id = item_curations.item_id WHERE items.collection_id = collections.id AND item_curations.status = $1), (SELECT MAX(item_curations.created_at) FROM item_curations item_curations JOIN items items ON items.id = item_curations.item_id WHERE items.collection_id = collections.id), collection_curations.created_at, collections.created_at) ${direction}, collections.id`
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

      expect(normalize(lastQuery().text)).toContain(
        'WHERE status IS NOT NULL GROUP BY status'
      )
      expect(lastQuery().values).not.toContain(CollectionStatus.REJECTED)
    })

    it('should count only the collections of the requested contract address', async () => {
      await Collection.countByStatus({
        address: '0xowner',
        contractAddress: '0xAbC',
      })

      expect(normalize(lastQuery().text)).toMatch(
        /LOWER\(collections.contract_address\) = \$\d+/
      )
      expect(lastQuery().values).toContain('0xabc')
    })

    it('should read from the same published collections as the list when filtering by them', async () => {
      await Collection.countByStatus({ isPublished: true })

      expect(normalize(lastQuery().text)).toContain(
        'items.blockchain_item_id is NOT NULL'
      )
    })
  })
})
