import {
  Collection,
  CollectionAttributes,
  ThirdPartyCollectionAttributes,
} from '../Collection'
import { FullItem } from '../Item'
import { createPost, getPost, updatePost } from './client'
import {
  buildCollectionForumPost,
  buildCollectionForumUpdateReply,
  buildStandardCollectionForumPost,
} from './utils'
import { UpsertPostResult } from './Forum.types'

export class ForumService {
  async upsertStandardCollectionForumPost(
    collection: CollectionAttributes,
    items: FullItem[],
    createdBy: string
  ): Promise<string | undefined> {
    const result = await createPost(
      buildStandardCollectionForumPost(collection, items, createdBy)
    )
    await Collection.update<CollectionAttributes>(
      { forum_link: result.link, forum_id: result.id },
      { id: collection.id }
    )
    return result.link
  }

  async upsertThirdPartyCollectionForumPost(
    collection: ThirdPartyCollectionAttributes,
    items: FullItem[]
  ): Promise<string | undefined> {
    let result: UpsertPostResult
    if (collection.forum_id) {
      const postData = await getPost(collection.forum_id)
      result = await updatePost(
        collection.forum_id,
        buildCollectionForumUpdateReply(postData.raw, items)
      )
    } else {
      result = await createPost(buildCollectionForumPost(collection, items))
      const { id: postId, link } = result
      await Collection.update<CollectionAttributes>(
        { forum_link: link, forum_id: postId },
        { id: collection.id }
      )
    }
    return result.link
  }
}
