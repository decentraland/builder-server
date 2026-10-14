import { dbCollectionMock } from '../../spec/mocks/collections'
import { dbItemMock } from '../../spec/mocks/items'
import { CollectionAttributes } from '../Collection'
import { Bridge } from '../ethereum/api/Bridge'
import { FullItem } from '../Item'
import {
  buildCollectionForumUpdateReply,
  buildStandardCollectionForumPost,
  buildThirdPartyCollectionForumPost,
} from './utils'

describe('when building the forum post of a collection with creator-controlled text', () => {
  let collection: CollectionAttributes
  let items: FullItem[]
  let raw: string

  beforeEach(() => {
    collection = {
      ...dbCollectionMock,
      name: '@staff [click](https://x.y)\n# heading',
    }
    items = [
      {
        ...Bridge.toFullItem(dbItemMock, collection),
        name: '@moderators',
        description: '![](tracker)',
      },
    ]
    raw = buildStandardCollectionForumPost(collection, items, 'Creator').raw
  })

  it('should not leave any mention in the post body', () => {
    expect(raw).not.toMatch(/@\w/)
  })

  it('should not leave a markdown link from the collection name', () => {
    expect(raw).not.toContain('[click](')
  })

  it('should not leave a markdown image from the item description', () => {
    expect(raw).not.toContain('![](tracker)')
  })

  it('should not let the collection name start a new heading', () => {
    expect(raw).not.toMatch(/^\s*#\s*heading/m)
  })

  it('should not leave an autolinkable URL from the collection name', () => {
    expect(raw).not.toContain('https://x.y')
  })
})

describe('when building the forum links of a collection', () => {
  let collection: CollectionAttributes
  let items: FullItem[]
  let originalBuilderUrl: string | undefined
  let originalCreatorsUrl: string | undefined

  beforeEach(() => {
    originalBuilderUrl = process.env.BUILDER_URL
    originalCreatorsUrl = process.env.CREATORS_URL
    process.env.BUILDER_URL = 'https://builder.example.org'
    collection = { ...dbCollectionMock, id: 'collection-id' }
    items = [
      {
        ...Bridge.toFullItem(dbItemMock, collection),
        id: 'item-id',
        collection_id: collection.id,
      },
    ]
  })

  afterEach(() => {
    if (originalBuilderUrl === undefined) delete process.env.BUILDER_URL
    else process.env.BUILDER_URL = originalBuilderUrl
    if (originalCreatorsUrl === undefined) delete process.env.CREATORS_URL
    else process.env.CREATORS_URL = originalCreatorsUrl
  })

  describe('and the collection is a standard one with the creators site configured', () => {
    let raw: string

    beforeEach(() => {
      process.env.CREATORS_URL = 'https://example.org/create'
      raw = buildStandardCollectionForumPost(collection, items, 'Creator').raw
    })

    it('should link the whole collection to the creators site editor in review mode', () => {
      expect(raw).toContain(
        '[View entire collection](https://example.org/create/collections/editor?collection=collection-id&reviewing=true)'
      )
    })

    it('should link each item to the creators site editor in review mode', () => {
      expect(raw).toContain(
        '[Link to editor](https://example.org/create/collections/editor?collection=collection-id&item=item-id&reviewing=true)'
      )
    })

    it('should not link the legacy Builder', () => {
      expect(raw).not.toContain('builder.example.org')
    })
  })

  describe('and the creators site is configured with a trailing slash', () => {
    beforeEach(() => {
      process.env.CREATORS_URL = 'https://example.org/create/'
    })

    it('should link the editor without a double slash', () => {
      expect(
        buildStandardCollectionForumPost(collection, items, 'Creator').raw
      ).toContain(
        '[View entire collection](https://example.org/create/collections/editor?collection=collection-id&reviewing=true)'
      )
    })
  })

  describe('and the collection is a standard one without the creators site configured', () => {
    let raw: string

    beforeEach(() => {
      delete process.env.CREATORS_URL
      raw = buildStandardCollectionForumPost(collection, items, 'Creator').raw
    })

    it('should link each item to the legacy Builder editor with the params it reads', () => {
      expect(raw).toContain(
        '[Link to editor](https://builder.example.org/item-editor?collection=collection-id&item=item-id)'
      )
    })
  })

  describe('and the collection is a third-party one', () => {
    beforeEach(() => {
      process.env.CREATORS_URL = 'https://example.org/create'
    })

    it('should keep linking the legacy Builder in the post', () => {
      const { raw } = buildThirdPartyCollectionForumPost(collection, items)
      expect(raw).toContain(
        '[Link to editor](https://builder.example.org/item-editor?collection=collection-id&item=item-id)'
      )
      expect(raw).not.toContain('example.org/create')
    })

    it('should keep linking the legacy Builder in update replies', () => {
      const reply = buildCollectionForumUpdateReply('old post', items)
      expect(reply).toContain(
        '[Link to editor](https://builder.example.org/item-editor?collection=collection-id&item=item-id)'
      )
    })
  })
})
