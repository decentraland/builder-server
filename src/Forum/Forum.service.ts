import {
  Collection,
  CollectionAttributes,
  ThirdPartyCollectionAttributes,
} from '../Collection'
import { FullItem } from '../Item'
import { createPost, getPost, updatePost } from './client'
import { DuplicatedForumPostTitleError } from './Forum.errors'
import {
  buildThirdPartyCollectionForumPost,
  buildCollectionForumUpdateReply,
  buildStandardCollectionForumPost,
  shortenAddress,
} from './utils'
import { ForumPost, UpsertPostResult } from './Forum.types'

export class ForumService {
  async upsertStandardCollectionForumPost(
    collection: CollectionAttributes,
    items: FullItem[],
    createdBy: string
  ): Promise<string> {
    const result = await this.createPostWithUniqueTitle(
      buildStandardCollectionForumPost(collection, items, createdBy),
      collection.contract_address
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
  ): Promise<string> {
    let result: UpsertPostResult
    if (collection.forum_id) {
      const postData = await getPost(collection.forum_id)
      result = await updatePost(
        collection.forum_id,
        buildCollectionForumUpdateReply(postData.raw, items)
      )
    } else {
      result = await createPost(
        buildThirdPartyCollectionForumPost(collection, items)
      )
      const { id: postId, link } = result
      await Collection.update<CollectionAttributes>(
        { forum_link: link, forum_id: postId },
        { id: collection.id }
      )
    }
    return result.link
  }

  private async createPostWithUniqueTitle(
    post: Pick<ForumPost, 'title' | 'raw'>,
    contractAddress: string | null
  ): Promise<UpsertPostResult> {
    try {
      return await createPost(post)
    } catch (error) {
      if (
        !(error instanceof DuplicatedForumPostTitleError) ||
        !contractAddress
      ) {
        throw error
      }
      return createPost({
        ...post,
        title: `${post.title} ${shortenAddress(contractAddress)}`,
      })
    }
  }
}
