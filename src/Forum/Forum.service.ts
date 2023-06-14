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
} from './utils'
import { UpsertPostResult } from './Forum.types'

export class ForumService {
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
