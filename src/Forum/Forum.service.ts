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

export class ForumService {
  async upsertThirdPartyCollectionForumPost(
    collection: ThirdPartyCollectionAttributes,
    items: FullItem[]
  ): Promise<string | undefined> {
    if (collection.forum_id) {
      const postData = await getPost(collection.forum_id)
      await updatePost(
        collection.forum_id,
        buildCollectionForumUpdateReply(postData.raw, items)
      )
      return
    } else {
      const { id: postId, link } = await createPost(
        buildCollectionForumPost(collection, items)
      )
      await Collection.update<CollectionAttributes>(
        { forum_link: link, forum_id: postId },
        { id: collection.id }
      )
      return link
    }
  }
}
