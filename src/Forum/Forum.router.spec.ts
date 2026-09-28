import supertest from 'supertest'
import { v4 as uuid } from 'uuid'
import { ethers } from 'ethers'
import {
  dbCollectionMock,
  dbTPCollectionMock,
} from '../../spec/mocks/collections'
import {
  buildURL,
  createAuthHeaders,
  mockExistsMiddleware,
} from '../../spec/utils'
import { createIdentity, fakePrivateKey, wallet } from '../../spec/mocks/wallet'
import { dbItemMock, dbTPItemMock } from '../../spec/mocks/items'
import { app } from '../server'
import {
  Collection,
  CollectionAttributes,
  CollectionService,
  ThirdPartyCollectionAttributes,
} from '../Collection'
import { Item, ItemAttributes, ThirdPartyItemAttributes } from '../Item'
import { Bridge } from '../ethereum/api/Bridge'
import { peerAPI } from '../ethereum/api/peer'
import { MAX_FORUM_ITEMS } from '../Item/utils'
import { createPost, getPost, updatePost } from './client'
import {
  buildCollectionForumPost,
  buildStandardCollectionForumPost,
  shortenAddress,
} from './utils'

const server = supertest(app.getApp())

jest.mock('../Collection/Collection.service')
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
  let mockedWallet: ethers.Wallet
  let forumId: number
  let forumLink: string

  beforeEach(() => {
    dbTPCollection = { ...dbTPCollectionMock }
    dbCollection = { ...dbCollectionMock }
    forumId = 1234
    forumLink = 'https://forum.com/some/forum/link'
    jest.spyOn(ethers.utils, 'verifyTypedData').mockReturnValue(wallet.address)
    jest
      .spyOn(CollectionService.prototype, 'isOwnedOrManagedBy')
      .mockResolvedValue(true)
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when posting a new forum post', () => {
    describe('and the collection is a TP collection', () => {
      let items: ThirdPartyItemAttributes[]

      beforeEach(async () => {
        url = `/collections/${dbTPCollection.id}/post`
        mockedWallet = new ethers.Wallet(fakePrivateKey)
        authHeaders = createAuthHeaders(
          'post',
          url,
          await createIdentity(mockedWallet, mockedWallet, 1)
        )
        mockExistsMiddleware(Collection, dbTPCollection.id)
        ;(Collection.findByIds as jest.Mock).mockResolvedValueOnce([
          dbTPCollection,
        ])
        items = [
          { ...dbTPItemMock, id: uuid(), local_content_hash: 'hash1' },
          { ...dbTPItemMock, id: uuid(), local_content_hash: 'hash2' },
          { ...dbTPItemMock, id: uuid(), local_content_hash: 'hash3' },
        ]
        ;(Item.findOrderedByCollectionId as jest.Mock).mockResolvedValue(items)
      })

      describe('and the forum post is being created for the first time', () => {
        beforeEach(() => {
          ;;(Collection.findOne as jest.Mock).mockResolvedValueOnce(
            dbTPCollection
          )
          ;(createPost as jest.Mock).mockResolvedValueOnce({
            id: forumId,
            link: forumLink,
          })
        })

        it('should create the forum post with the server-built content', () => {
          return server
            .post(buildURL(url))
            .set(authHeaders)
            .send({})
            .then(() => {
              expect(createPost).toHaveBeenCalledWith(
                buildCollectionForumPost(
                  dbTPCollection,
                  items
                    .slice(0, MAX_FORUM_ITEMS)
                    .map((item) => Bridge.toFullItem(item, dbTPCollection))
                )
              )
            })
        })

        it('should update the collection forum_link property with the post creation', () => {
          return server
            .post(buildURL(url))
            .set(authHeaders)
            .send({})
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
            .send({})
            .expect(200)
            .then((response: any) => {
              expect(response.body).toEqual({ data: forumLink, ok: true })
            })
        })
      })

      describe('and the collection already has a forum id', () => {
        beforeEach(() => {
         ; ;(Collection.findOne as jest.Mock).mockResolvedValueOnce({
            ...dbTPCollection,
            forum_id: 1,
          })
          ;(getPost as jest.Mock).mockResolvedValueOnce({
            title: 'The title of the post',
            raw: 'The raw text from the post',
          })
          ;(updatePost as jest.Mock).mockResolvedValueOnce({
            id: 1,
            link: forumLink,
          })
        })

        it('should update the existing forum post instead of creating a new one', () => {
          return server
            .post(buildURL(url))
            .set(authHeaders)
            .send({})
            .expect(200)
            .then(() => {
              expect(updatePost).toHaveBeenCalledWith(1, expect.any(String))
              expect(createPost).not.toHaveBeenCalled()
            })
        })
      })
    })

    describe('and the collection is a Standard collection', () => {
      let items: ItemAttributes[]

      beforeEach(async () => {
        url = `/collections/${dbCollection.id}/post`
        mockedWallet = new ethers.Wallet(fakePrivateKey)
        authHeaders = createAuthHeaders(
          'post',
          url,
          await createIdentity(mockedWallet, mockedWallet, 1)
        )
        mockExistsMiddleware(Collection, dbCollection.id)
        ;(Collection.findByIds as jest.Mock).mockResolvedValueOnce([
          dbCollection,
        ])
        ;(Collection.findOne as jest.Mock).mockResolvedValue(dbCollection)
        items = [
          { ...dbItemMock, id: uuid() },
          { ...dbItemMock, id: uuid() },
        ]
        ;(Item.findOrderedByCollectionId as jest.Mock).mockResolvedValue(items)
      })

      describe('and the collection is published', () => {
        beforeEach(() => {
        ;(CollectionService.prototype
            .isDCLPublished as jest.Mock   ).mockResolvedValue(true)
          ;(createPost as jest.Mock).mockResolvedValueOnce({
            id: forumId,
            link: forumLink,
          })
        })

        describe('and the profile has an avatar name', () => {
          beforeEach(() => {
            jest
              .spyOn(peerAPI, 'getProfileName')
              .mockResolvedValue('AvatarName')
          })

          it('should create the forum post with the server-built content using the avatar name', () => {
            return server
              .post(buildURL(url))
              .set(authHeaders)
              .send({})
              .expect(200)
              .then(() => {
                expect(createPost).toHaveBeenCalledWith(
                  buildStandardCollectionForumPost(
                    dbCollection,
                    items
                      .slice(0, MAX_FORUM_ITEMS)
                      .map((item) => Bridge.toFullItem(item, dbCollection)),
                    'AvatarName'
                  )
                )
              })
          })

          it('should ignore client-supplied title, raw, topic_id and archetype', () => {
            return server
              .post(buildURL(url))
              .set(authHeaders)
              .send({
                forumPost: {
                  title: 'attacker title',
                  raw: 'attacker body',
                  topic_id: 7,
                  archetype: 'banner',
                },
              })
              .expect(200)
              .then(() => {
                const [postArg] = (createPost as jest.Mock).mock.calls[0]
                expect(postArg).not.toHaveProperty('topic_id')
                expect(postArg).not.toHaveProperty('archetype')
                expect(postArg.raw).not.toBe('attacker body')
                expect(postArg.title).toContain(dbCollection.name)
              })
          })

          it('should update the collection forum_link property with the post creation', () => {
            return server
              .post(buildURL(url))
              .set(authHeaders)
              .send({})
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
              .send({})
              .expect(200)
              .then((response: any) => {
                expect(response.body).toEqual({ data: forumLink, ok: true })
              })
          })
        })

        describe('and the profile has no avatar name', () => {
          beforeEach(() => {
            jest.spyOn(peerAPI, 'getProfileName').mockResolvedValue(undefined)
          })

          it('should build the title with the shortened owner address', () => {
            return server
              .post(buildURL(url))
              .set(authHeaders)
              .send({})
              .expect(200)
              .then(() => {
                expect(createPost).toHaveBeenCalledWith(
                  buildStandardCollectionForumPost(
                    dbCollection,
                    items
                      .slice(0, MAX_FORUM_ITEMS)
                      .map((item) => Bridge.toFullItem(item, dbCollection)),
                    shortenAddress(dbCollection.eth_address)
                  )
                )
              })
          })
        })
      })

      describe('and the collection is not published', () => {
        beforeEach(() => {
       ;(CollectionService.prototype
            .isDCLPublished as jest.Mock    ).mockResolvedValue(false)
        })

        it('should respond with a 401 and not post to the forum', () => {
          return server
            .post(buildURL(url))
            .set(authHeaders)
            .send({})
            .expect(401)
            .then(() => {
              expect(createPost).not.toHaveBeenCalled()
            })
        })
      })

      describe('and the collection already has a forum post', () => {
        beforeEach(() => {
      ;(CollectionService.prototype
            .isDCLPublished as jest.Mock     ).mockResolvedValue(true)
          ;(Collection.findOne as jest.Mock).mockResolvedValue({
            ...dbCollection,
            forum_link: 'https://forum.com/some/forum/link',
          })
        })

        it('should respond with a 409 including the existing forum_link and not post to the forum', () => {
          return server
            .post(buildURL(url))
            .set(authHeaders)
            .send({})
            .expect(409)
            .then((response) => {
              expect(response.body).toEqual({
                ok: false,
                error: 'Forum post already exists',
                data: {
                  id: dbCollection.id,
                  forum_link: 'https://forum.com/some/forum/link',
                },
              })
              expect(createPost).not.toHaveBeenCalled()
            })
        })
      })
    })
  })
})
