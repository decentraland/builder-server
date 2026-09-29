import { dbCollectionMock } from '../../spec/mocks/collections'
import { dbItemMock } from '../../spec/mocks/items'
import { CollectionAttributes } from '../Collection'
import { Bridge } from '../ethereum/api/Bridge'
import { FullItem } from '../Item'
import { buildStandardCollectionForumPost } from './utils'

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
