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
