import supertest from 'supertest'
import { v4 as uuid } from 'uuid'
import {
  dbCollectionMock,
  dbTPCollectionMock,
} from '../../spec/mocks/collections'
import {
  buildURL,
  createAuthHeaders,
  mockExistsMiddleware,
} from '../../spec/utils'
import { app } from '../server'
import {
  Collection,
  CollectionAttributes,
  CollectionService,
  ThirdPartyCollectionAttributes,
} from '../Collection'
import { Item, ThirdPartyItemAttributes } from '../Item'
import { ForumPost } from './Forum.types'
import { createIdentity, fakePrivateKey, wallet } from '../../spec/mocks/wallet'
import { ethers } from 'ethers'
import { dbTPItemMock } from '../../spec/mocks/items'
import { createPost, getPost, updatePost } from './client'
import {
  buildCollectionForumPost,
  buildCollectionForumUpdateReply,
} from './utils'
import { MAX_FORUM_ITEMS } from '../Item/utils'

const server = supertest(app.getApp())

jest.mock('../Collection/Collection.Service')
jest.mock('../Curation/ItemCuration/ItemCuration.model')
jest.mock('../Curation/CollectionCuration/CollectionCuration.model')
jest.mock('../Collection/Collection.model')
jest.mock('../Item/Item.model')
jest.mock('./client')

describe('Forum router', () => {
  let dbTPCollection: ThirdPartyCollectionAttributes
  let dbCollection: CollectionAttributes
  let url: string
  let authHeaders: Record<string, string>
  let mockedWallet

  beforeEach(() => {
    dbTPCollection = { ...dbTPCollectionMock }
    dbCollection = { ...dbCollectionMock }
    jest.spyOn(ethers.utils, 'verifyTypedData').mockReturnValue(wallet.address)
    jest
      .spyOn(CollectionService.prototype, 'isOwnedOrManagedBy')
      .mockResolvedValue(true)
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when posting a new forum post', () => {
    let forumId: number
    let forumLink: string

    beforeEach(async () => {
      forumId = 1234
      forumLink = 'https://forum.com/some/forum/link'
    })

    describe('and the collection is a TP collection', () => {
      beforeEach(async () => {
        url = `/collections/${dbTPCollection.id}/post`
        mockedWallet = new ethers.Wallet(fakePrivateKey)
        authHeaders = createAuthHeaders(
          'post',
          url,
          await createIdentity(mockedWallet, mockedWallet, 1)
        )
        mockExistsMiddleware(Collection, dbTPCollection.id)
        // Mocking the function that is used in the custom modelAuthorizationCheck
        ;(Collection.findByIds as jest.Mock).mockResolvedValueOnce([
          dbTPCollection,
        ])
      })

      describe('when the supplied data and signature are correct', () => {
        let items: ThirdPartyItemAttributes[]

        beforeEach(async () => {
          items = [
            { ...dbTPItemMock, id: uuid(), local_content_hash: 'hash1' },
            { ...dbTPItemMock, id: uuid(), local_content_hash: 'hash2' },
            { ...dbTPItemMock, id: uuid(), local_content_hash: 'hash3' },
          ]
          ;(Item.findOrderedByCollectionId as jest.Mock).mockResolvedValueOnce(
            items
          )
        })

        describe('and the server responds correctly', () => {
          let post: ForumPost

          beforeEach(async () => {
            post = {
              title: 'The title of the post',
              raw: 'The raw text from the post',
            } as ForumPost
            ;(getPost as jest.Mock).mockResolvedValueOnce(post)
          })

          describe('and the forum post is being created for the first time', () => {
            beforeEach(() => {
              ;(Collection.findOne as jest.Mock).mockResolvedValueOnce(
                dbTPCollection
              )
              ;(createPost as jest.Mock).mockResolvedValueOnce({
                id: forumId,
                link: forumLink,
              })
            })

            it('should create a forum post with the response data', () => {
              return server
                .post(buildURL(url))
                .set(authHeaders)
                .send({ forumPost: post })
                .then(() => {
                  expect(createPost).toHaveBeenCalledWith(
                    buildCollectionForumPost(
                      dbTPCollection,
                      items.slice(0, MAX_FORUM_ITEMS) as any
                    )
                  )
                })
            })

            it('should update the collection forum_link property with the post creation', () => {
              return server
                .post(buildURL(url))
                .set(authHeaders)
                .send({ forumPost: post })
                .expect(200)
                .then(() => {
                  expect(Collection.update).toHaveBeenCalledWith(
                    { forum_id: forumId, forum_link: forumLink },
                    { id: dbTPCollection.id }
                  )
                })
            })

            it('should return the link of the forum post', () => {
              return server
                .post(buildURL(url))
                .set(authHeaders)
                .send({ forumPost: post })
                .expect(200)
                .then((response: any) => {
                  expect(response.body).toEqual({ data: forumLink, ok: true })
                })
            })
          })

          describe('and the collection already has a forum id', () => {
            let forumId: number

            beforeEach(() => {
              forumId = 1
              ;(Collection.findOne as jest.Mock).mockResolvedValueOnce({
                ...dbTPCollection,
                forum_id: forumId,
              })
            })

            it('should update the forum post with the response data', () => {
              return server
                .post(buildURL(url))
                .set(authHeaders)
                .send({
                  forumPost: post,
                })
                .expect(200)
                .then(() => {
                  expect(updatePost).toHaveBeenCalledWith(
                    forumId,
                    buildCollectionForumUpdateReply(
                      post.raw,
                      items.slice(0, MAX_FORUM_ITEMS) as any
                    )
                  )
                })
            })
          })
        })
      })
    })

    describe('and the collection is a Standard collection', () => {
      let post: ForumPost

      beforeEach(async () => {
        url = `/collections/${dbCollection.id}/post`
        mockedWallet = new ethers.Wallet(fakePrivateKey)
        authHeaders = createAuthHeaders(
          'post',
          url,
          await createIdentity(mockedWallet, mockedWallet, 1)
        )

        // Mocking the function that is used in the custom modelAuthorizationCheck
        ;(Collection.findByIds as jest.Mock).mockResolvedValueOnce([
          dbCollection,
        ])
        ;(Collection.findOne as jest.Mock).mockResolvedValueOnce(dbCollection)

        post = {
          title: 'The title of the post',
          raw: 'The raw text from the post',
        } as ForumPost
        ;(createPost as jest.Mock).mockResolvedValueOnce({
          id: forumId,
          link: forumLink,
        })
        mockExistsMiddleware(Collection, dbCollection.id)
      })

      it('should create a forum post with the response data', () => {
        return server
          .post(buildURL(url))
          .set(authHeaders)
          .send({ forumPost: post })
          .then(() => {
            expect(createPost).toHaveBeenCalledWith(post)
          })
      })

      it('should update the collection forum_link property with the post creation', () => {
        return server
          .post(buildURL(url))
          .set(authHeaders)
          .send({ forumPost: post })
          .expect(200)
          .then(() => {
            expect(Collection.update).toHaveBeenCalledWith(
              { forum_id: forumId, forum_link: forumLink },
              { id: dbCollection.id }
            )
          })
      })

      it('should return the link of the forum post', () => {
        return server
          .post(buildURL(url))
          .set(authHeaders)
          .send({ forumPost: post })
          .expect(200)
          .then((response: any) => {
            expect(response.body).toEqual({ data: forumLink, ok: true })
          })
      })
    })
  })
})
