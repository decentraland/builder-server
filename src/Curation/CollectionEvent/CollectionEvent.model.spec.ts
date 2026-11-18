import { CollectionEvent } from './CollectionEvent.model'
import { CollectionEventType } from './CollectionEvent.types'

describe('when finding the latest event of a collection', () => {
  let querySpy: jest.SpyInstance

  beforeEach(() => {
    querySpy = jest.spyOn(CollectionEvent, 'query').mockResolvedValue([])
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('should leave the comments out, so an open appeal stays the latest event', async () => {
    await CollectionEvent.findLatestByCollectionId('collectionId')

    const statement = querySpy.mock.calls[0][0]
    expect(statement.text).toMatch(/type <> \$\d/)
    expect(statement.values).toContain(CollectionEventType.REVIEW_COMMENT)
  })
})

describe('when finding the stale validations the sweep re-sends', () => {
  let querySpy: jest.SpyInstance

  beforeEach(() => {
    querySpy = jest.spyOn(CollectionEvent, 'query').mockResolvedValue([])
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('should only count an error the validator marked retryable, or a request that was never sent', async () => {
    await CollectionEvent.findStaleAutomatedStarted(new Date(), new Date())

    const statement = querySpy.mock.calls[0][0]
    const text = statement.text.replace(/\s+/g, ' ')
    expect(text).toContain(
      "AND COALESCE(error.payload->>'retryable' = 'true' OR error.payload->>'reason' = $"
    )
    expect(text).toContain(
      "AND NOT COALESCE(verdict.payload->>'retryable' = 'true' OR verdict.payload->>'reason' = $"
    )
    expect(statement.values).toContain('publish_failed')
  })
})

describe('when breaking ties between events written at the same instant', () => {
  let querySpy: jest.SpyInstance

  beforeEach(() => {
    querySpy = jest.spyOn(CollectionEvent, 'query').mockResolvedValue([])
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('should order by id after the creation time', async () => {
    await CollectionEvent.findLatestByCollectionIdAndType(
      'collectionId',
      CollectionEventType.REVIEW_AUTOMATED_STARTED
    )
    await CollectionEvent.findPageByCollectionId('collectionId', 10, 0)

    for (const [statement] of querySpy.mock.calls) {
      expect(statement.text).toMatch(/ORDER BY created_at DESC, id DESC/)
    }
  })
})

describe('when finding the hashes the validator judged', () => {
  let querySpy: jest.SpyInstance

  afterEach(() => {
    jest.restoreAllMocks()
  })

  beforeEach(() => {
    querySpy = jest.spyOn(CollectionEvent, 'query').mockResolvedValue([
      { item_id: 'itemA', content_hash: 'hashA' },
      { item_id: 'itemB', content_hash: 'hashB' },
    ])
  })

  it('should take each item from the latest judged run that sent it, with no limit on how far back', async () => {
    await expect(
      CollectionEvent.findJudgedHashesByCollectionId('collectionId')
    ).resolves.toEqual({ itemA: 'hashA', itemB: 'hashB' })

    const text = querySpy.mock.calls[0][0].text.replace(/\s+/g, ' ')
    expect(text).toContain('SELECT DISTINCT ON (hashes.key)')
    expect(text).toContain(
      'ORDER BY hashes.key, started.created_at DESC, started.id DESC'
    )
    expect(text).not.toContain('LIMIT')
  })
})
