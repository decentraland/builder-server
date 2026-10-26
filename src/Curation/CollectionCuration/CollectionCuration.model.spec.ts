import { CollectionCuration } from './CollectionCuration.model'

describe('CollectionCuration model', () => {
  function normalize(text: string): string {
    return text.replace(/\s+/g, ' ').trim()
  }

  describe('when building the latest request statement', () => {
    describe('without on-chain approvals', () => {
      it('should take the newest request of every collection as it is stored', () => {
        const statement = CollectionCuration.getLatestStatement([])

        expect(normalize(statement.text)).toEqual(
          '(SELECT DISTINCT ON (cc.collection_id) cc.* FROM collection_curations cc ORDER BY cc.collection_id, cc.created_at DESC) collection_curations'
        )
        expect(statement.values).toEqual([])
      })
    })

    describe('with on-chain approvals', () => {
      const reviewedAt = new Date('2026-10-20T12:00:00.000Z')

      it('should read a pending request older than its collection approval as approved, keeping the rest', () => {
        const statement = CollectionCuration.getLatestStatement([
          { contractAddress: '0xapproved', reviewedAt },
        ])
        const text = normalize(statement.text)

        expect(text).toContain(
          "CASE WHEN cc.status = $1 AND cc.created_at < (approvals.reviewed_at AT TIME ZONE 'UTC') THEN $2::curation_status ELSE cc.status END AS status"
        )
        expect(text).toContain(
          'LEFT JOIN unnest($3::text[], $4::timestamptz[]) approvals(contract_address, reviewed_at) ON approvals.contract_address = collections.contract_address'
        )
        expect(text).toMatch(
          /^\( SELECT DISTINCT ON \(cc.collection_id\) .* ORDER BY cc.collection_id, cc.created_at DESC \) collection_curations$/
        )
        expect(statement.values).toEqual([
          'pending',
          'approved',
          ['0xapproved'],
          [reviewedAt],
        ])
      })
    })
  })
})
