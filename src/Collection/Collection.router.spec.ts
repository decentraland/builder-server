import supertest from 'supertest'
import { ethers } from 'ethers'
import { v4 as uuid } from 'uuid'
import { utils } from 'decentraland-commons'
import {
  createAuthHeaders,
  buildURL,
  mockExistsMiddleware,
  mockOwnableCanUpsert,
  mockCollectionAuthorizationMiddleware,
  mockIsCollectionPublished,
  mockThirdPartyCollectionIsPublished,
  mockAuthenticationSignatureValidationDate,
  mockThirdPartyCollectionURNExists,
} from '../../spec/utils'
import {
  dbCollectionMock,
  collectionDataMock,
  collectionFragmentMock,
  convertCollectionDatesToISO,
  ResultCollection,
  dbTPCollectionMock,
  toResultCollection,
} from '../../spec/mocks/collections'
import { createIdentity, fakePrivateKey, wallet } from '../../spec/mocks/wallet'
import {
  convertItemDatesToISO,
  dbItemMock,
  dbTPItemMock,
  itemFragmentMock,
} from '../../spec/mocks/items'
import { itemCurationMock } from '../../spec/mocks/itemCuration'
import { mockedCheque } from '../../spec/mocks/cheque'
import {
  ItemFragment,
  CollectionFragment,
  ReceiptFragment,
  ThirdPartyFragment,
} from '../ethereum/api/fragments'
import { collectionAPI } from '../ethereum/api/collection'
import { thirdPartyAPI } from '../ethereum/api/thirdParty'
import { Bridge } from '../ethereum/api/Bridge'
import { peerAPI } from '../ethereum/api/peer'
import { ItemCuration } from '../Curation/ItemCuration'
import {
  CollectionCuration,
  CollectionCurationAttributes,
} from '../Curation/CollectionCuration'
import { MAX_FORUM_ITEMS } from '../Item/utils'
import {
  Item,
  ItemAttributes,
  ThirdPartyItemAttributes,
  DBItemApprovalData,
} from '../Item'
import {
  buildCollectionForumPost,
  buildCollectionForumUpdateReply,
  createPost,
  ForumPost,
  getPost,
  updatePost,
} from '../Forum'
import {
  Cheque,
  SlotUsageCheque,
  SlotUsageChequeAttributes,
} from '../SlotUsageCheque'
import { CurationStatus, CurationStatusSort } from '../Curation'
import { isCommitteeMember } from '../Committee'
import { app } from '../server'
import { hasPublicAccess } from './access'
import { toFullCollection } from './utils'
import { Collection } from './Collection.model'
import {
  CollectionAttributes,
  ThirdPartyCollectionAttributes,
  FullCollection,
} from './Collection.types'

const server = supertest(app.getApp())
jest.mock('../ethereum/api/collection')
jest.mock('../ethereum/api/peer')
jest.mock('../ethereum/api/thirdParty')
jest.mock('../utils/eth')
jest.mock('../Forum/client')
jest.mock('../SlotUsageCheque')
jest.mock('../Curation/ItemCuration')
jest.mock('../Curation/CollectionCuration')
jest.mock('../Committee')
jest.mock('../Item/Item.model')
jest.mock('./Collection.model')
jest.mock('./access')

const thirdPartyAPIMock = thirdPartyAPI as jest.Mocked<typeof thirdPartyAPI>

describe('Collection router', () => {
  let dbCollection: CollectionAttributes
  let dbTPCollection: ThirdPartyCollectionAttributes
  let resultingCollectionAttributes: ResultCollection
  let url: string

  beforeEach(() => {
    dbCollection = { ...dbCollectionMock }
    dbTPCollection = { ...dbTPCollectionMock }
    resultingCollectionAttributes = toResultCollection(dbCollection)
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when upserting a collection', () => {
    const network = 'ropsten'
    let urn_suffix: string
    let third_party_id: string
    let urn: string
    let collectionToUpsert: FullCollection
    let expectedCollectionToUpsert: FullCollection

    beforeEach(() => {
      urn_suffix = dbTPCollection.urn_suffix
      third_party_id = dbTPCollection.third_party_id
    })

    describe('and the collection id is different than the one provided as the collection data', () => {
      let otherId: string

      beforeEach(() => {
        url = `/collections/${dbCollection.id}`
        otherId = 'bec9eb58-2ac0-11ec-8d3d-0242ac130003'
        collectionToUpsert = {
          ...toFullCollection(dbCollectionMock),
          id: otherId,
        }
      })

      it('should respond with a bad request error', () => {
        return server
          .put(buildURL(url))
          .set(createAuthHeaders('put', url))
          .send({ collection: collectionToUpsert })
          .expect(400)
          .then((response: any) => {
            expect(response.body).toEqual({
              ok: false,
              data: {
                urlId: dbCollection.id,
                bodyId: otherId,
              },
              error: 'The body and URL collection ids do not match',
            })
          })
      })
    })

    describe('and the request is missing the collection property', () => {
      beforeEach(() => {
        url = `/collections/${dbCollection.id}`
      })
      it('should return an http error for the invalid request body', () => {
        return server
          .put(buildURL(url))
          .set(createAuthHeaders('put', url))
          .send({ notCollection: collectionToUpsert })
          .expect(400)
          .then((response: any) => {
            expect(response.body).toEqual({
              ok: false,
              data: [
                {
                  dataPath: '',
                  keyword: 'required',
                  message: "should have required property 'collection'",
                  params: {
                    missingProperty: 'collection',
                  },
                  schemaPath: '#/required',
                },
              ],
              error: 'Invalid request body',
            })
          })
      })
    })

    describe('when the collection is a third party collection', () => {
      beforeEach(() => {
        url = `/collections/${dbTPCollection.id}`
        urn = `${third_party_id}:${urn_suffix}`
        collectionToUpsert = {
          ...utils.omit(toFullCollection(dbTPCollection), [
            'created_at',
            'updated_at',
          ]),
          urn,
        }
        expectedCollectionToUpsert = {
          ...toFullCollection(dbTPCollection),
          urn,
        }
      })

      describe("and the upserted collection wasn't a third party collection before", () => {
        beforeEach(() => {
          thirdPartyAPIMock.isManager.mockResolvedValueOnce(true)
          ;(Collection.findOne as jest.Mock).mockResolvedValueOnce({
            ...dbTPCollection,
            urn_suffix: null,
            third_party_id: null,
          })
        })

        it("should respond with a 409 and a message signaling that the collection can't be converted into a third party collection", () => {
          return server
            .put(buildURL(url))
            .set(createAuthHeaders('put', url))
            .send({ collection: collectionToUpsert })
            .expect(409)
            .then((response: any) => {
              expect(response.body).toEqual({
                ok: false,
                data: {
                  id: dbTPCollection.id,
                },
                error:
                  "The collection can't be converted into a third party collection.",
              })
            })
        })
      })

      describe('and the upserted collection is changing the urn and it already has items published', () => {
        beforeEach(() => {
          dbTPCollection = {
            ...dbTPCollection,
            urn_suffix: 'old-urn-suffix',
            third_party_id,
          }
          thirdPartyAPIMock.isManager.mockResolvedValueOnce(true)
          ;(Collection.findOne as jest.Mock).mockResolvedValueOnce(
            dbTPCollection
          )
        })

        describe('and it already has items published', () => {
          beforeEach(() => {
            mockThirdPartyCollectionIsPublished(dbTPCollection.id, true)
          })

          it("should respond with a 409 and a message signaling that the collection can't be changed because it's already published", () => {
            return server
              .put(buildURL(url))
              .set(createAuthHeaders('put', url))
              .send({ collection: collectionToUpsert })
              .expect(409)
              .then((response: any) => {
                expect(response.body).toEqual({
                  ok: false,
                  data: {
                    id: dbTPCollection.id,
                  },
                  error:
                    "The third party collection already has published items. It can't be updated or inserted.",
                })
              })
          })
        })

        describe("and it doesn't have items already published but the new urn points to a collection that does", () => {
          beforeEach(() => {
            mockThirdPartyCollectionIsPublished(dbTPCollection.id, false)
            mockThirdPartyCollectionURNExists(
              collectionToUpsert.id,
              third_party_id,
              urn_suffix,
              true
            )
          })

          it("should respond with a 409 and a message signaling that the collection can't be changed because it's already published", () => {
            return server
              .put(buildURL(url))
              .set(createAuthHeaders('put', url))
              .send({ collection: collectionToUpsert })
              .expect(409)
              .then((response: any) => {
                expect(response.body).toEqual({
                  ok: false,
                  data: {
                    id: dbTPCollection.id,
                    urn: collectionToUpsert.urn,
                  },
                  error:
                    "The URN provided already belongs to a collection. The collection can't be updated.",
                })
              })
          })
        })
      })

      describe('and the collection exists and is locked', () => {
        beforeEach(() => {
          const currentDate = Date.now()
          mockAuthenticationSignatureValidationDate()
          thirdPartyAPIMock.isManager.mockResolvedValueOnce(true)
          jest.spyOn(Date, 'now').mockReturnValueOnce(currentDate)
          ;(Collection.findOne as jest.Mock).mockResolvedValueOnce({
            ...dbTPCollection,
            lock: new Date(currentDate),
          })
          ;(Collection.upsertWithItemCount as jest.MockedFunction<
            typeof Collection.upsertWithItemCount
          >).mockResolvedValueOnce({
            ...dbTPCollection,
            lock: new Date(currentDate),
            item_count: 0,
          })
        })

        afterEach(() => {
          ;(Date.now as jest.Mock).mockRestore()
        })

        it('should respond with a 423 and a message saying that the collection is locked', () => {
          return server
            .put(buildURL(url))
            .set(createAuthHeaders('put', url))
            .send({ collection: collectionToUpsert })
            .expect(423)
            .then((response: any) => {
              expect(response.body).toEqual({
                ok: false,
                data: {
                  id: dbTPCollection.id,
                },
                error: "The collection is locked. It can't be updated.",
              })
            })
        })
      })

      describe('and the collection exists and the user is not a manager of the third party registry', () => {
        beforeEach(() => {
          thirdPartyAPIMock.isManager.mockResolvedValueOnce(false)
          ;(Collection.findOne as jest.Mock).mockResolvedValueOnce(
            dbTPCollection
          )
        })

        it('should respond with a 401 and a message signaling that the user is not authorized to upsert the collection', () => {
          return server
            .put(buildURL(url))
            .set(createAuthHeaders('put', url))
            .send({ collection: collectionToUpsert })
            .expect(401)
            .then((response: any) => {
              expect(response.body).toEqual({
                ok: false,
                data: {
                  id: collectionToUpsert.id,
                  eth_address: wallet.address,
                },
                error: 'Unauthorized to upsert collection',
              })
            })
        })
      })

      describe('and the collection exists and is not locked', () => {
        beforeEach(() => {
          thirdPartyAPIMock.isManager.mockResolvedValueOnce(true)
          ;(Collection.findOne as jest.Mock).mockResolvedValueOnce(
            dbTPCollection
          )
          ;(Collection.upsertWithItemCount as jest.MockedFunction<
            typeof Collection.upsertWithItemCount
          >).mockImplementationOnce(async (attributes) => ({
            ...attributes,
            item_count: 0,
            lock: null,
            created_at: expectedCollectionToUpsert.created_at,
            updated_at: expectedCollectionToUpsert.updated_at,
          }))
        })

        it('should upsert the collection and respond with the upserted collection', () => {
          return server
            .put(buildURL(url))
            .set(createAuthHeaders('put', url))
            .send({ collection: collectionToUpsert })
            .expect(200)
            .then((response: any) => {
              expect(response.body).toEqual({
                ok: true,
                data: {
                  ...convertCollectionDatesToISO(expectedCollectionToUpsert),
                  item_count: 0,
                  contract_address: null,
                },
              })
            })
        })
      })

      describe("and the collection doesn't exist", () => {
        beforeEach(() => {
          ;(Collection.findOne as jest.Mock).mockResolvedValueOnce(null)
        })

        describe('and the user is not a manager of the third party registry given in the URN', () => {
          beforeEach(() => {
            thirdPartyAPIMock.isManager.mockResolvedValueOnce(false)
          })

          it('should respond with a 401 and a message signaling that the user is not authorized to upsert the collection', () => {
            return server
              .put(buildURL(url))
              .set(createAuthHeaders('put', url))
              .send({ collection: collectionToUpsert })
              .expect(401)
              .then((response: any) => {
                expect(response.body).toEqual({
                  ok: false,
                  data: {
                    id: collectionToUpsert.id,
                    eth_address: wallet.address,
                  },
                  error: 'Unauthorized to upsert collection',
                })
              })
          })
        })

        describe('and there are items already published with the collection id', () => {
          beforeEach(() => {
            thirdPartyAPIMock.isManager.mockResolvedValueOnce(true)
            mockThirdPartyCollectionURNExists(
              collectionToUpsert.id,
              third_party_id,
              urn_suffix,
              true
            )
          })

          it('should respond with a 409 and a message saying that the there is a collection with that urn already published', () => {
            return server
              .put(buildURL(url))
              .set(createAuthHeaders('put', url))
              .send({ collection: collectionToUpsert })
              .expect(409)
              .then((response: any) => {
                expect(response.body).toEqual({
                  ok: false,
                  data: {
                    id: dbTPCollection.id,
                    urn: collectionToUpsert.urn,
                  },
                  error:
                    "The URN provided already belongs to a collection. The collection can't be updated or inserted.",
                })
              })
          })
        })

        describe("and there aren't any items published with the collection id", () => {
          beforeEach(() => {
            thirdPartyAPIMock.isManager.mockResolvedValueOnce(true)
            mockThirdPartyCollectionURNExists(
              collectionToUpsert.id,
              third_party_id,
              urn_suffix,
              false
            )
            ;(Collection.upsertWithItemCount as jest.MockedFunction<
              typeof Collection.upsertWithItemCount
            >).mockImplementationOnce(async (attributes) => ({
              ...attributes,
              item_count: 0,
              lock: null,
              created_at: expectedCollectionToUpsert.created_at,
              updated_at: expectedCollectionToUpsert.updated_at,
            }))
          })

          it('should respond with a 200, the inserted collection and have upserted the collection with the sent collection', () => {
            return server
              .put(buildURL(url))
              .set(createAuthHeaders('put', url))
              .send({ collection: collectionToUpsert })
              .expect(200)
              .then((response: any) => {
                expect(response.body).toEqual({
                  ok: true,
                  data: convertCollectionDatesToISO({
                    ...expectedCollectionToUpsert,
                    item_count: 0,
                  }),
                })
              })
          })
        })
      })
    })

    describe('when the collection is a decentraland collection', () => {
      beforeEach(() => {
        url = `/collections/${dbCollection.id}`
        urn = `urn:decentraland:${network}:collections-v2:${dbCollection.contract_address}`
      })

      describe('and the collection to upsert has the is_published property', () => {
        beforeEach(() => {
          collectionToUpsert = {
            ...toFullCollection(dbCollection),
            is_published: true,
            is_approved: false,
            urn,
          }
        })

        it("should respond with a 409 and an error saying that the property can't be changed", () => {
          return server
            .put(buildURL(url))
            .set(createAuthHeaders('put', url))
            .send({ collection: collectionToUpsert, data: 'someString' })
            .expect(409)
            .then((response: any) => {
              expect(response.body).toEqual({
                ok: false,
                data: {
                  id: dbCollection.id,
                  eth_address: wallet.address,
                },
                error: 'Cannot change the is_published or is_approved property',
              })
            })
        })
      })

      describe('and the collection to upsert has the is_approved property set', () => {
        beforeEach(() => {
          collectionToUpsert = {
            ...toFullCollection(dbCollection),
            is_published: false,
            is_approved: true,
            urn,
          }
        })

        it("should respond with a 409 and an error saying that the property can't be changed", () => {
          return server
            .put(buildURL(url))
            .set(createAuthHeaders('put', url))
            .send({ collection: collectionToUpsert, data: 'someString' })
            .expect(409)
            .then((response: any) => {
              expect(response.body).toEqual({
                ok: false,
                data: {
                  id: dbCollection.id,
                  eth_address: wallet.address,
                },
                error: 'Cannot change the is_published or is_approved property',
              })
            })
        })
      })

      describe("and the user doesn't own the collection", () => {
        beforeEach(() => {
          collectionToUpsert = {
            ...toFullCollection(dbCollection),
            urn,
          }
          mockOwnableCanUpsert(
            Collection,
            dbCollection.id,
            wallet.address,
            false
          )
        })

        it('should respond with a 401 and an error saying that the user is not authorized', () => {
          return server
            .put(buildURL(url))
            .set(createAuthHeaders('put', url))
            .send({ collection: collectionToUpsert, data: 'someString' })
            .expect(401)
            .then((response: any) => {
              expect(response.body).toEqual({
                ok: false,
                data: {
                  id: dbCollection.id,
                  eth_address: wallet.address,
                },
                error: 'Unauthorized to upsert collection',
              })
            })
        })
      })

      describe('and the collection name is not valid', () => {
        beforeEach(() => {
          collectionToUpsert = {
            ...toFullCollection(dbCollection),
            urn,
          }
          mockOwnableCanUpsert(
            Collection,
            dbCollection.id,
            wallet.address,
            true
          )
          ;(Collection.isValidName as jest.Mock).mockResolvedValueOnce(false)
        })

        it('should respond with a 409 and an error saying that the name is already in use', () => {
          return server
            .put(buildURL(url))
            .set(createAuthHeaders('put', url))
            .send({ collection: collectionToUpsert, data: 'someString' })
            .expect(409)
            .then((response: any) => {
              expect(response.body).toEqual({
                ok: false,
                data: {
                  id: dbCollection.id,
                  name: collectionToUpsert.name,
                },
                error: 'Name already in use',
              })
            })
        })
      })

      describe('and the collection already exists and is published', () => {
        beforeEach(() => {
          collectionToUpsert = {
            ...toFullCollection(dbCollection),
            urn,
          }
          mockOwnableCanUpsert(
            Collection,
            dbCollection.id,
            wallet.address,
            true
          )
          ;(Collection.findOne as jest.MockedFunction<
            typeof Collection.findOne
          >).mockResolvedValueOnce(dbCollection)
          ;(Collection.isValidName as jest.Mock).mockResolvedValueOnce(true)
          ;(Collection.findOne as jest.Mock).mockResolvedValueOnce(dbCollection)
          ;(collectionAPI.fetchCollection as jest.Mock).mockResolvedValueOnce(
            {}
          )
        })

        it('should respond with a 409 and an error saying that the collection is already published', () => {
          return server
            .put(buildURL(url))
            .set(createAuthHeaders('put', url))
            .send({ collection: collectionToUpsert, data: 'someString' })
            .expect(409)
            .then((response: any) => {
              expect(response.body).toEqual({
                ok: false,
                data: {
                  id: dbCollection.id,
                },
                error: "The collection is published. It can't be updated.",
              })
            })
        })
      })

      describe('and the collection already already exists and is locked', () => {
        beforeEach(() => {
          const currentDate = Date.now()
          mockAuthenticationSignatureValidationDate()
          collectionToUpsert = {
            ...toFullCollection(dbCollection),
            urn,
          }
          mockOwnableCanUpsert(
            Collection,
            dbCollection.id,
            wallet.address,
            true
          )
          ;(Collection.isValidName as jest.Mock).mockResolvedValueOnce(true)
          ;(Collection.findOne as jest.Mock).mockResolvedValueOnce({
            ...dbCollection,
            lock: currentDate,
          })
          mockIsCollectionPublished(dbCollection.id, false)
          jest.spyOn(Date, 'now').mockReturnValueOnce(currentDate)
        })

        afterEach(() => {
          ;(Date.now as jest.Mock).mockRestore()
        })

        it('should respond with a 423 and an error saying that the collection is locked', () => {
          return server
            .put(buildURL(url))
            .set(createAuthHeaders('put', url))
            .send({ collection: collectionToUpsert, data: 'someString' })
            .expect(423)
            .then((response: any) => {
              expect(response.body).toEqual({
                ok: false,
                data: {
                  id: dbCollection.id,
                },
                error: "The collection is locked. It can't be updated.",
              })
            })
        })
      })

      describe('and the collection is upserted', () => {
        beforeEach(() => {
          collectionToUpsert = {
            ...utils.omit(toFullCollection(dbCollectionMock), [
              'created_at',
              'updated_at',
            ]),
            urn,
          }
          expectedCollectionToUpsert = {
            ...toFullCollection(dbCollectionMock),
            urn,
          }
          mockOwnableCanUpsert(
            Collection,
            dbCollection.id,
            wallet.address,
            true
          )
          ;(Collection.findOne as jest.MockedFunction<
            typeof Collection.findOne
          >).mockResolvedValueOnce(dbCollection)
          ;(Collection.upsertWithItemCount as jest.MockedFunction<
            typeof Collection.upsertWithItemCount
          >).mockImplementationOnce(async (attributes) => ({
            ...attributes,
            item_count: 0,
            lock: null,
            created_at: expectedCollectionToUpsert.created_at,
            updated_at: expectedCollectionToUpsert.updated_at,
          }))
          ;(Collection.isValidName as jest.Mock).mockResolvedValueOnce(true)
          ;(Collection.findOne as jest.Mock).mockResolvedValueOnce({
            ...dbCollection,
            lock: null,
          })
          mockIsCollectionPublished(dbCollection.id, false)
        })

        it('should upsert the collection and respond with a 200 and the upserted collection', () => {
          return server
            .put(buildURL(url))
            .set(createAuthHeaders('put', url))
            .send({
              collection: collectionToUpsert,
              data: collectionDataMock,
            })
            .expect(200)
            .then((response: any) => {
              expect(response.body).toEqual({
                ok: true,
                data: convertCollectionDatesToISO({
                  ...expectedCollectionToUpsert,
                  item_count: 0,
                  salt: expect.stringMatching(/0[xX][0-9a-fA-F]{64}/),
                  contract_address: expect.stringMatching(
                    /0[xX][0-9a-fA-F]{40}/
                  ),
                  eth_address: wallet.address,
                  urn: expect.stringMatching(
                    /urn:decentraland:mumbai:collections-v2:0[xX][0-9a-fA-F]{40}/
                  ),
                }),
              })
            })
        })

        describe('and the urn supplied is null', () => {
          beforeEach(() => {
            collectionToUpsert = {
              ...toFullCollection(dbCollection),
              urn: null,
            }
          })

          it('should upsert the collection and respond with a 200 and the upserted collection', () => {
            return server
              .put(buildURL(url))
              .set(createAuthHeaders('put', url))
              .send({
                collection: collectionToUpsert,
                data: collectionDataMock,
              })
              .expect(200)
              .then((response: any) => {
                expect(response.body).toEqual({
                  ok: true,
                  data: convertCollectionDatesToISO({
                    ...collectionToUpsert,
                    item_count: 0,
                    salt: expect.stringMatching(/0[xX][0-9a-fA-F]{64}/),
                    contract_address: expect.stringMatching(
                      /0[xX][0-9a-fA-F]{40}/
                    ),
                    urn: expect.stringMatching(
                      /urn:decentraland:mumbai:collections-v2:0[xX][0-9a-fA-F]{40}/
                    ),
                  }),
                })
              })
          })
        })
      })
    })
  })

  describe('when retrieving all the collections', () => {
    beforeEach(() => {
      ;(isCommitteeMember as jest.Mock).mockResolvedValueOnce(true)
      ;(Collection.findByContractAddresses as jest.Mock).mockResolvedValueOnce(
        []
      )
      ;(collectionAPI.fetchCollections as jest.Mock).mockResolvedValueOnce([])
      thirdPartyAPIMock.fetchThirdParties.mockResolvedValueOnce([])
    })

    describe('and sending pagination params', () => {
      let page: number, limit: number
      let baseUrl: string
      let totalCollectionsFromDb: number
      beforeEach(() => {
        ;(page = 1), (limit = 3)
        totalCollectionsFromDb = 1
        baseUrl = '/collections'
        url = `${baseUrl}?limit=${limit}&page=${page}`
        ;(Collection.findAll as jest.Mock).mockResolvedValueOnce([
          { ...dbCollection, collection_count: totalCollectionsFromDb },
        ])
      })
      it('should respond with pagination data and should have call the findAll method with the params', () => {
        return server
          .get(buildURL(url))
          .set(createAuthHeaders('get', baseUrl))
          .expect(200)
          .then((response: any) => {
            expect(response.body).toEqual({
              data: {
                total: totalCollectionsFromDb,
                pages: totalCollectionsFromDb,
                page,
                limit,
                results: [
                  {
                    ...resultingCollectionAttributes,
                    urn: `urn:decentraland:mumbai:collections-v2:${dbCollection.contract_address}`,
                  },
                ],
              },

              ok: true,
            })
            expect(Collection.findAll).toHaveBeenCalledWith({
              assignee: undefined,
              isPublished: undefined,
              q: undefined,
              sort: undefined,
              status: undefined,
              limit,
              offset: page - 1, // it's the offset,
              thirdPartyIds: [],
              remoteIds: [],
            })
          })
      })
    })

    describe('and sending pagination params plus filtering options', () => {
      let page: number,
        limit: number,
        baseUrl: string,
        totalCollectionsFromDb: number,
        q: string,
        assignee: string,
        status: string,
        sort: string,
        isPublished: string
      beforeEach(() => {
        ;(page = 1), (limit = 3)
        assignee = '0x1234567890123456789012345678901234567890'
        status = 'published'
        sort = 'NAME_DESC'
        isPublished = 'true'
        q = 'collection name 1'
        totalCollectionsFromDb = 1
        baseUrl = '/collections'
        url = `${baseUrl}?limit=${limit}&page=${page}&assignee=${assignee}&status=${status}&sort=${sort}&is_published=${isPublished}&q=${q}`
        ;(Collection.findAll as jest.Mock).mockResolvedValueOnce([
          { ...dbCollection, collection_count: totalCollectionsFromDb },
        ])
      })
      it('should respond with pagination data and should have call the findAll method with the right params', () => {
        return server
          .get(buildURL(url))
          .set(createAuthHeaders('get', baseUrl))
          .expect(200)
          .then((response: any) => {
            expect(response.body).toEqual({
              data: {
                total: totalCollectionsFromDb,
                pages: totalCollectionsFromDb,
                page,
                limit,
                results: [
                  {
                    ...resultingCollectionAttributes,
                    urn: `urn:decentraland:mumbai:collections-v2:${dbCollection.contract_address}`,
                  },
                ],
              },

              ok: true,
            })
            expect(Collection.findAll).toHaveBeenCalledWith({
              q,
              assignee,
              status,
              sort,
              isPublished: true,
              offset: page - 1, // it's the offset
              limit,
              thirdPartyIds: [],
              remoteIds: [],
            })
          })
      })
    })

    describe('and not sending any pagination params ', () => {
      beforeEach(() => {
        url = `/collections`
        ;(Collection.findAll as jest.Mock)
          .mockResolvedValueOnce([dbCollection])
          .mockResolvedValueOnce([])
      })
      it('should respond with all the collections with the URN and the legacy response', () => {
        return server
          .get(buildURL(url))
          .set(createAuthHeaders('get', url))
          .expect(200)
          .then((response: any) => {
            expect(response.body).toEqual({
              data: [
                {
                  ...resultingCollectionAttributes,
                  urn: `urn:decentraland:mumbai:collections-v2:${dbCollection.contract_address}`,
                },
              ],
              ok: true,
            })
          })
      })
    })
  })

  describe('when retrieving the collections of an address', () => {
    beforeEach(() => {
      ;(collectionAPI.fetchCollectionsByAuthorizedUser as jest.Mock).mockReturnValueOnce(
        []
      )
      ;(collectionAPI.fetchCollections as jest.Mock).mockResolvedValueOnce([])
      url = `/${wallet.address}/collections`
    })

    describe('sending pagination params plus filtering options', () => {
      let page: number,
        limit: number,
        isPublished: string,
        totalCollectionsFromDb: number
      beforeEach(() => {
          page = 1, 
          limit = 3,
          isPublished = 'true',
          totalCollectionsFromDb = 1
        ;(Collection.findAll as jest.Mock).mockReturnValueOnce([
          { ...dbCollection, collection_count: totalCollectionsFromDb },
        ])
        ;(Collection.findByThirdPartyIds as jest.Mock).mockReturnValueOnce(
          []
        )
        ;(thirdPartyAPI.fetchThirdPartiesByManager as jest.Mock).mockReturnValueOnce(
          []
        )
      })

      it('should respond with pagination data and should have call the findAll method with the right params', () => {
        return server
          .get(buildURL(`${url}?limit=${limit}&page=${page}&is_published=${isPublished}`))
          .set(createAuthHeaders('get', url))
          .expect(200)
          .then((response: any) => {
            expect(response.body).toEqual({
              data: {
                total: totalCollectionsFromDb,
                pages: totalCollectionsFromDb,
                page,
                limit,
                results: [
                  {
                    ...resultingCollectionAttributes,
                    urn: `urn:decentraland:mumbai:collections-v2:${dbCollection.contract_address}`,
                  },
                ],
              },

              ok: true,
            })
            expect(Collection.findAll).toHaveBeenCalledWith({
              address: wallet.address,
              limit,
              offset: page - 1,
              sort: CurationStatusSort.NEWEST,
              isPublished: true,
              thirdPartyIds: [],
              remoteIds: [],
            })
          })
      })
    })

    describe('and not sending any pagination params ', () => {
      beforeEach(() => {
        ;(Collection.findAll as jest.Mock).mockReturnValueOnce([
          dbCollection,
          dbTPCollection,
        ])
        ;(Collection.findByThirdPartyIds as jest.Mock).mockReturnValueOnce([
          dbTPCollection,
        ])
        ;(thirdPartyAPI.fetchThirdPartiesByManager as jest.Mock).mockReturnValueOnce(
          [{ id: dbTPCollection.third_party_id }]
        )
        ;(ItemCuration.findLastByCollectionId as jest.Mock).mockReturnValueOnce(
          itemCurationMock
        )
        mockThirdPartyCollectionIsPublished(dbTPCollection.id, false)
      })

      it('should return the requested collections with the URN', () => {
        return server
          .get(buildURL(url))
          .set(createAuthHeaders('get', url))
          .expect(200)
          .then((response: any) => {
            expect(Collection.findAll).toHaveBeenCalledWith({
              address: wallet.address,
              limit: undefined,
              offset: undefined,
              sort: CurationStatusSort.NEWEST,
              thirdPartyIds: [dbTPCollection.third_party_id],
              remoteIds: [],
            })
            expect(response.body).toEqual({
              data: [
                {
                  ...resultingCollectionAttributes,
                  urn: `urn:decentraland:mumbai:collections-v2:${dbCollection.contract_address}`,
                },
                {
                  ...toResultCollection(dbTPCollection),
                  is_published: true,
                  urn: `${dbTPCollection.third_party_id}:${dbTPCollection.urn_suffix}`,
                  reviewed_at: itemCurationMock.updated_at.toISOString(),
                  created_at: itemCurationMock.created_at.toISOString(),
                  updated_at: itemCurationMock.updated_at.toISOString(),
                },
              ],
              ok: true,
            })
          })
      })
    })
  })

  describe('when retrieving a single collection', () => {
    beforeEach(() => {
      mockExistsMiddleware(Collection, dbCollection.id)
      ;(hasPublicAccess as jest.Mock).mockResolvedValueOnce(true)
      ;(Collection.findByIds as jest.Mock).mockReturnValueOnce([dbCollection])
      ;(collectionAPI.fetchCollection as jest.Mock).mockReturnValueOnce(null)
      url = `/collections/${dbCollection.id}`
    })

    it('should return the requested collection with the URN', () => {
      return server
        .get(buildURL(url))
        .set(createAuthHeaders('get', url))
        .expect(200)
        .then((response: any) => {
          expect(response.body).toEqual({
            data: {
              ...resultingCollectionAttributes,
              urn: `urn:decentraland:mumbai:collections-v2:${dbCollection.contract_address}`,
            },
            ok: true,
          })
          expect(Collection.findByIds).toHaveBeenCalledWith([dbCollection.id])
        })
    })
  })

  describe('when locking a collection', () => {
    let now: number
    let lock: Date

    beforeEach(() => {
      now = 1633022119407
      lock = new Date(now)
      mockAuthenticationSignatureValidationDate()
      jest.spyOn(Date, 'now').mockReturnValueOnce(now)
      mockExistsMiddleware(Collection, dbCollection.id)
      mockCollectionAuthorizationMiddleware(dbCollection.id, wallet.address)
      ;(Collection.findByIds as jest.MockedFunction<
        typeof Collection.findOne
      >).mockResolvedValueOnce([dbCollection])
      url = `/collections/${dbCollection.id}/lock`
    })

    afterEach(() => {
      ;(Date.now as jest.Mock).mockRestore()
    })

    describe('when the lock update succeeds', () => {
      it('should update the lock with .now() on the supplied collection id for the owner', () => {
        return server
          .post(buildURL(url))
          .set(createAuthHeaders('post', url))
          .expect(200)
          .then((response: any) => {
            expect(response.body).toEqual({
              data: lock.toISOString(),
              ok: true,
            })
            expect(Collection.update).toHaveBeenCalledWith(
              { lock },
              { id: dbCollection.id, eth_address: wallet.address }
            )
          })
      })
    })

    describe('when the lock update fails', () => {
      const errorMessage = 'Error message'

      beforeEach(() => {
        ;(Collection.update as jest.Mock).mockRejectedValueOnce(
          new Error(errorMessage)
        )
        ;(Collection.count as jest.MockedFunction<
          typeof Collection.count
        >).mockResolvedValueOnce(1)
        ;(Collection.findByIds as jest.MockedFunction<
          typeof Collection.findOne
        >).mockResolvedValueOnce([dbCollection])
      })

      it('should fail with an error if the update throws', () => {
        return server
          .post(buildURL(url))
          .set(createAuthHeaders('post', url))
          .expect(500)
          .then((response: any) => {
            expect(response.body).toEqual({
              ok: false,
              data: {
                id: dbCollection.id,
                eth_address: wallet.address,
                error: errorMessage,
              },
              error: "The collection couldn't be updated",
            })
          })
      })
    })
  })

  describe('when deleting a collection', () => {
    describe('and the collection is a TP collection', () => {
      beforeEach(() => {
        url = `/collections/${dbTPCollection.id}`
        mockExistsMiddleware(Collection, dbTPCollection.id)
      })

      describe('and the user is not a manager of the TP collection', () => {
        beforeEach(() => {
          mockCollectionAuthorizationMiddleware(
            dbTPCollection.id,
            wallet.address,
            true,
            false
          )
        })

        it('should respond with a 401 and a message signaling that the user is not authorized', () => {
          return server
            .delete(buildURL(url))
            .set(createAuthHeaders('delete', url))
            .expect(401)
            .then((response: any) => {
              expect(response.body).toEqual({
                ok: false,
                data: {
                  ethAddress: wallet.address,
                  tableName: Collection.tableName,
                },
                error: `Unauthorized user ${wallet.address} for collections ${dbTPCollection.id}`,
              })
            })
        })
      })

      describe('and the user is a manager of the TP collection', () => {
        beforeEach(() => {
          mockCollectionAuthorizationMiddleware(
            dbTPCollection.id,
            wallet.address,
            true
          )
          ;(Collection.findByIds as jest.MockedFunction<
            typeof Collection.findOne
          >).mockResolvedValueOnce([dbTPCollection])
        })

        describe('and it has third party items already published', () => {
          beforeEach(() => {
            mockThirdPartyCollectionIsPublished(dbTPCollection.id, true)
          })

          it('should respond with a 409 and a message signaling that the collection has already published items', () => {
            return server
              .delete(buildURL(url))
              .set(createAuthHeaders('delete', url))
              .expect(409)
              .then((response: any) => {
                expect(response.body).toEqual({
                  error:
                    "The third party collection already has published items. It can't be deleted.",
                  data: {
                    id: dbTPCollection.id,
                  },
                  ok: false,
                })
              })
          })
        })

        describe('and it is locked', () => {
          beforeEach(() => {
            const lockDate = new Date()
            mockAuthenticationSignatureValidationDate()
            dbTPCollection.lock = lockDate
            mockThirdPartyCollectionIsPublished(dbTPCollection.id, false)
            jest.spyOn(Date, 'now').mockReturnValueOnce(lockDate.getTime())
          })

          beforeEach(() => {
            ;(Date.now as jest.Mock).mockRestore()
          })

          it('should respond with a 423 and a message signaling that the collection is locked', () => {
            return server
              .delete(buildURL(url))
              .set(createAuthHeaders('delete', url))
              .expect(423)
              .then((response: any) => {
                expect(response.body).toEqual({
                  error: "The collection is locked. It can't be deleted.",
                  data: {
                    id: dbTPCollection.id,
                  },
                  ok: false,
                })
              })
          })
        })

        describe('and its neither locked nor some of its items published', () => {
          beforeEach(() => {
            const lockDate = new Date()
            mockAuthenticationSignatureValidationDate()
            dbTPCollection.lock = lockDate
            mockThirdPartyCollectionIsPublished(dbTPCollection.id, false)
            jest
              .spyOn(Date, 'now')
              .mockReturnValueOnce(lockDate.getTime() + 1000 * 60 * 60 * 24)
          })

          afterEach(() => {
            ;(Date.now as jest.Mock).mockRestore()
          })

          it('should respond with a 200 and deleted the collection and the items of the collection', () => {
            return server
              .delete(buildURL(url))
              .set(createAuthHeaders('delete', url))
              .expect(200)
              .then((response: any) => {
                expect(response.body).toEqual({
                  data: true,
                  ok: true,
                })

                expect(Collection.delete).toHaveBeenCalledWith({
                  id: dbTPCollection.id,
                })
                expect(Item.delete).toHaveBeenCalledWith({
                  collection_id: dbTPCollection.id,
                })
              })
          })
        })
      })
    })

    describe('and the collection is a DCL collection', () => {
      beforeEach(() => {
        url = `/collections/${dbCollection.id}`
        mockExistsMiddleware(Collection, dbCollection.id)
        mockCollectionAuthorizationMiddleware(dbCollection.id, wallet.address)
        ;(Collection.findByIds as jest.MockedFunction<
          typeof Collection.findOne
        >).mockResolvedValueOnce([dbCollection])
      })

      describe('and it is already published', () => {
        beforeEach(() => {
          ;(collectionAPI.fetchCollection as jest.MockedFunction<
            typeof collectionAPI.fetchCollection
          >).mockResolvedValueOnce({} as CollectionFragment)
        })

        it('should respond with a 409 and a message signaling that the collection is already published', () => {
          return server
            .delete(buildURL(url))
            .set(createAuthHeaders('delete', url))
            .expect(409)
            .then((response: any) => {
              expect(response.body).toEqual({
                error: "The collection is published. It can't be deleted.",
                data: {
                  id: dbCollection.id,
                },
                ok: false,
              })
            })
        })
      })

      describe('and it is not published but locked', () => {
        beforeEach(() => {
          const lockDate = new Date()
          mockAuthenticationSignatureValidationDate()
          dbCollection.lock = lockDate
          mockIsCollectionPublished(dbCollection.id, false)
          jest.spyOn(Date, 'now').mockReturnValueOnce(lockDate.getTime())
        })

        afterEach(() => {
          ;(Date.now as jest.Mock).mockRestore()
        })

        it('should respond with a 423 and a message signaling that the collection is locked', () => {
          return server
            .delete(buildURL(url))
            .set(createAuthHeaders('delete', url))
            .expect(423)
            .then((response: any) => {
              expect(response.body).toEqual({
                error: "The collection is locked. It can't be deleted.",
                data: {
                  id: dbCollection.id,
                },
                ok: false,
              })
            })
        })
      })

      describe('and its neither locked nor published', () => {
        beforeEach(() => {
          const lockDate = new Date()
          mockAuthenticationSignatureValidationDate()
          dbCollection.lock = lockDate
          mockIsCollectionPublished(dbCollection.id, false)
          jest
            .spyOn(Date, 'now')
            .mockReturnValueOnce(lockDate.getTime() + 1000 * 60 * 60 * 24)
        })

        afterEach(() => {
          ;(Date.now as jest.Mock).mockRestore()
        })

        it('should respond with a 200 and deleted the collection and the items of the collection', () => {
          return server
            .delete(buildURL(url))
            .set(createAuthHeaders('delete', url))
            .expect(200)
            .then((response: any) => {
              expect(response.body).toEqual({
                data: true,
                ok: true,
              })

              expect(Collection.delete).toHaveBeenCalledWith({
                id: dbCollection.id,
              })
              expect(Item.delete).toHaveBeenCalledWith({
                collection_id: dbCollection.id,
              })
            })
        })
      })
    })
  })

  describe('when publishing a collection', () => {
    describe('and the collection is a TP collection', () => {
      beforeEach(() => {
        url = `/collections/${dbTPCollection.id}/publish`
        mockExistsMiddleware(Collection, dbTPCollection.id)
      })

      describe('when sending an empty item ids array', () => {
        beforeEach(() => {
          ;(Item.findByIds as jest.Mock).mockResolvedValueOnce([])
          ;(Collection.findByIds as jest.Mock).mockResolvedValueOnce([
            dbTPCollection,
          ])
        })

        it('should respond with a 400 and a message signaling the item ids should not be empty', () => {
          return server
            .post(buildURL(url))
            .set(createAuthHeaders('post', url))
            .send({
              itemIds: [],
              cheque: {
                signature: 'signature',
                qty: 1,
                salt: '0xsalt',
              },
            })
            .expect(400)
            .then((response: any) => {
              expect(response.body).toEqual({
                ok: false,
                data: { id: dbTPCollection.id },
                error: 'Tried to publish no TP items',
              })
            })
        })
      })

      describe('when sending more items than the available slots in the tp registry', () => {
        let items: ItemAttributes[]
        let tpRegistryMaxItems: number
        let tpCurationsAmonut: number

        beforeEach(() => {
          ;(Collection.findByIds as jest.Mock).mockResolvedValueOnce([
            dbTPCollection,
          ])
          items = [
            { ...dbTPItemMock, id: 'c241ef7c-4466-41b0-bf94-be1b8c331fdb' },
            { ...dbTPItemMock, id: 'anotherId' },
            { ...dbTPItemMock, id: 'yetAnotherId' },
          ]
          ;(Item.findByIds as jest.Mock).mockResolvedValueOnce(items)
          tpRegistryMaxItems = 4
          tpCurationsAmonut = 2 // so there are only 2 available slots
          thirdPartyAPIMock.fetchMaxItemsByThirdParty.mockResolvedValueOnce(
            tpRegistryMaxItems
          )
          ;(ItemCuration.countByThirdPartyId as jest.Mock).mockResolvedValueOnce(
            tpCurationsAmonut
          )
        })

        it('should respond with a 400 and a message signaling the amount of items to publish exceeds the available slots', () => {
          return server
            .post(buildURL(url))
            .set(createAuthHeaders('post', url))
            .send({
              itemIds: items.map((item) => item.id),
              cheque: {
                signature: 'signature',
                qty: 1,
                salt: '0xsalt',
              },
            })
            .expect(409)
            .then((response: any) => {
              expect(response.body).toEqual({
                ok: false,
                data: { id: dbTPCollection.id },
                error:
                  'The amount of items to publish exceeds the available slots.',
              })
            })
        })
      })

      describe('when sending cheque with an amount of slots different than the amount items published', () => {
        let items: ItemAttributes[]

        beforeEach(() => {
          ;(Collection.findByIds as jest.Mock).mockResolvedValueOnce([
            dbTPCollection,
          ])
          items = [
            { ...dbTPItemMock, id: 'c241ef7c-4466-41b0-bf94-be1b8c331fdb' },
            { ...dbTPItemMock, id: 'anotherId' },
          ]
          ;(Item.findByIds as jest.Mock).mockResolvedValueOnce(items)
        })

        it('should respond with a 400 and a message signaling the item ids should not be empty', () => {
          return server
            .post(buildURL(url))
            .set(createAuthHeaders('post', url))
            .send({
              itemIds: items.map((item) => item.id),
              cheque: {
                signature: 'signature',
                qty: 1,
                salt: '0xsalt',
              },
            })
            .expect(400)
            .then((response: any) => {
              expect(response.body).toEqual({
                ok: false,
                data: { id: dbTPCollection.id },
                error:
                  'The check quantity is different from the amount of published items',
              })
            })
        })
      })

      describe('when sending an invalid signature', () => {
        beforeEach(() => {
          ;(Collection.findByIds as jest.Mock).mockResolvedValueOnce([
            dbTPCollection,
          ])
          ;(Item.findByIds as jest.Mock).mockResolvedValueOnce([dbTPItemMock])
        })

        it('should respond with a 400 and a message signaling an address missmatch in the signature and sender', () => {
          return server
            .post(buildURL(url))
            .set(createAuthHeaders('post', url))
            .send({
              itemIds: [dbTPItemMock.id],
              cheque: {
                signature:
                  '0x692d14c3d04572ef9b8fe6694ea1d796159b8b2839d9ce0553042d45dcf17da475a750823f3a552f349f6b82802f37506a022c8ea3791c6d2966223134011a5c1b',
                qty: 1, // this is the field that is wrong
                salt:
                  '0x866023072516cda998ccd2b696fbbed3912fa5ecea8b474af6e40dadc5352ce4',
              },
            })
            .expect(400)
            .then((response: any) => {
              expect(response.body).toEqual({
                ok: false,
                data: { id: dbTPCollection.id },
                error:
                  'Tried to publish TP items with an invalid signed message or signature. Error: Address missmatch',
              })
            })
        })
      })

      describe('when the items do not share the same collection id', () => {
        let items: ThirdPartyItemAttributes[]
        let itemIds: string[]

        beforeEach(() => {
          ;(Collection.findByIds as jest.Mock).mockResolvedValueOnce([
            dbTPCollection,
          ])
          items = [
            { ...dbTPItemMock, id: uuid(), collection_id: '1' },
            { ...dbTPItemMock, id: uuid(), collection_id: '1' },
            { ...dbTPItemMock, id: uuid(), collection_id: '2' },
            { ...dbTPItemMock, id: uuid(), collection_id: '3' },
            { ...dbTPItemMock, id: uuid(), collection_id: '1' },
          ]
          itemIds = items.map((item) => item.id)
          ;(Item.findByIds as jest.Mock).mockResolvedValueOnce(items)
          jest
            .spyOn(ethers.utils, 'verifyTypedData')
            .mockReturnValue(wallet.address)
        })
        afterEach(() => {
          jest.restoreAllMocks() // to reset the verifyTypedData mock from above
        })

        it('should respond with a 400 and a message signaling that all item collections should be the same', () => {
          return server
            .post(buildURL(url))
            .set(createAuthHeaders('post', url))
            .send({
              itemIds,
              cheque: {
                signature: 'signature',
                qty: items.length,
                salt: '0xsalt',
              },
            })
            .expect(400)
            .then((response: any) => {
              expect(response.body).toEqual({
                ok: false,
                data: { id: dbTPCollection.id },
                error:
                  'Cannot publish items that belong to different collections',
              })
            })
        })
      })

      describe('when the collection already has a pending ItemCuration', () => {
        beforeEach(() => {
          ;(Collection.findByIds as jest.Mock).mockResolvedValueOnce([
            dbTPCollection,
          ])
          ;(Item.findByIds as jest.Mock).mockResolvedValueOnce([
            { ...dbItemMock, collection_id: dbTPCollection.id },
          ])
          ;(ItemCuration.findLastCreatedByCollectionIdAndStatus as jest.Mock).mockResolvedValueOnce(
            itemCurationMock
          )
          jest
            .spyOn(ethers.utils, 'verifyTypedData')
            .mockReturnValue(wallet.address)
        })
        afterEach(() => {
          jest.restoreAllMocks() // to reset the verifyTypedData mock from above
        })

        it('should respond with a 409 and a message signaling that you cannot publish items twice', () => {
          return server
            .post(buildURL(url))
            .set(createAuthHeaders('post', url))
            .send({
              itemIds: [dbItemMock.id],
              cheque: {
                signature: 'signature',
                qty: 1,
                salt: '0xsalt',
              },
            })
            .expect(409)
            .then((response: any) => {
              expect(response.body).toEqual({
                ok: false,
                data: { id: dbTPCollection.id },
                error:
                  "The third party collection already has published items. It can't be updated.",
              })
            })
        })
      })

      describe('and interacting with the database fails', () => {
        let dbItems: ItemAttributes[]
        let dbItemIds: string[]
        let createdItemCurationIds: string[]
        let slotUsageCheque: SlotUsageChequeAttributes

        beforeEach(() => {
          ;(Collection.findByIds as jest.Mock).mockResolvedValueOnce([
            dbTPCollection,
          ])
          dbItems = [
            { ...dbItemMock, id: uuid(), collection_id: dbTPCollection.id },
            { ...dbItemMock, id: uuid(), collection_id: dbTPCollection.id },
          ]
          dbItemIds = dbItems.map((item) => item.id)
          slotUsageCheque = { id: uuid() } as SlotUsageChequeAttributes
          createdItemCurationIds = []
          ;(Item.findByIds as jest.Mock).mockResolvedValueOnce(dbItems)
          ;(ItemCuration.findLastCreatedByCollectionIdAndStatus as jest.Mock).mockResolvedValueOnce(
            undefined
          )
          ;(ItemCuration.create as jest.Mock).mockImplementationOnce(
            (attributes) => {
              createdItemCurationIds.push(attributes.id)
              return Promise.resolve(attributes)
            }
          )
          ;(ItemCuration.create as jest.Mock).mockImplementationOnce(
            (attributes) => {
              createdItemCurationIds.push(attributes.id)
              return Promise.reject(new Error('Database error'))
            }
          )
          ;(ItemCuration.deleteByIds as jest.Mock).mockResolvedValueOnce([])

          jest
            .spyOn(SlotUsageCheque, 'create')
            .mockResolvedValueOnce(slotUsageCheque)
          jest.spyOn(SlotUsageCheque, 'delete').mockResolvedValueOnce('')

          jest
            .spyOn(ethers.utils, 'verifyTypedData')
            .mockReturnValue(wallet.address)
        })

        afterEach(() => {
          jest.restoreAllMocks() // to reset the verifyTypedData mock from above
        })

        it('should respond with a 400 and a message signaling that the database errored out', () => {
          return server
            .post(buildURL(url))
            .set(createAuthHeaders('post', url))
            .send({
              itemIds: dbItemIds,
              cheque: {
                signature: 'signature',
                qty: dbItemIds.length,
                salt: '0xsalt',
              },
            })
            .expect(400)
            .then((response: any) => {
              expect(response.body).toEqual({
                ok: false,
                data: { id: dbTPCollection.id },
                error: 'An error occurred trying to publish: Database error',
              })
            })
        })

        it('should rollback the created data', () => {
          return server
            .post(buildURL(url))
            .set(createAuthHeaders('post', url))
            .send({
              itemIds: dbItemIds,
              cheque: {
                signature: 'signature',
                qty: dbItemIds.length,
                salt: '0xsalt',
              },
            })
            .expect(400)
            .then(() => {
              expect(SlotUsageCheque.delete).toHaveBeenCalledWith({
                id: slotUsageCheque.id,
              })
              expect(ItemCuration.deleteByIds).toHaveBeenCalledWith(
                createdItemCurationIds
              )
            })
        })
      })

      describe('when the supplied data and signature are correct', () => {
        let items: ThirdPartyItemAttributes[]
        let itemIds: string[]
        let forumId: number
        let forumLink: string
        let authHeaders: Record<string, string>
        let mockedWallet
        let cheque: Cheque
        let tpRegistryMaxItems: number
        let tpCurationsAmonut: number

        beforeEach(async () => {
          mockedWallet = new ethers.Wallet(fakePrivateKey)
          cheque = { ...mockedCheque }
          authHeaders = createAuthHeaders(
            'post',
            url,
            await createIdentity(mockedWallet, mockedWallet, 1)
          )
          items = [
            { ...dbTPItemMock, id: uuid(), local_content_hash: 'hash1' },
            { ...dbTPItemMock, id: uuid(), local_content_hash: 'hash2' },
            { ...dbTPItemMock, id: uuid(), local_content_hash: 'hash3' },
          ]
          itemIds = items.map((item) => item.id)
          forumId = 1234
          forumLink = 'https://forum.com/some/forum/link'
          ;(Item.findByIds as jest.Mock).mockResolvedValueOnce(items)
          ;(ItemCuration.findLastByCollectionId as jest.Mock).mockResolvedValueOnce(
            undefined
          )
          ;(ItemCuration.create as jest.Mock).mockResolvedValue(
            itemCurationMock
          )
          ;(createPost as jest.Mock).mockResolvedValueOnce({
            id: forumId,
            link: forumLink,
          })
          ;(SlotUsageCheque.create as jest.Mock).mockResolvedValueOnce({})
          jest
            .spyOn(Bridge, 'consolidateTPItems')
            .mockResolvedValueOnce(items as any)
          tpRegistryMaxItems = 5
          tpCurationsAmonut = 2 // so there are only 3 available slots and 3 items being published
          thirdPartyAPIMock.fetchMaxItemsByThirdParty.mockResolvedValueOnce(
            tpRegistryMaxItems
          )
          ;(ItemCuration.countByThirdPartyId as jest.Mock).mockResolvedValueOnce(
            tpCurationsAmonut
          )
        })

        describe('and the item collection does not have a virtual curation', () => {
          beforeEach(() => {
            ;(Collection.findByIds as jest.Mock).mockResolvedValueOnce([
              dbTPCollection,
            ])
          })
          it('should create a SlotUsageCheque record with the request data', () => {
            return server
              .post(buildURL(url))
              .set(authHeaders)
              .send({
                itemIds,
                cheque,
              })
              .expect(200)
              .then(() => {
                expect(SlotUsageCheque.create).toHaveBeenCalledWith({
                  id: expect.any(String),
                  signature: cheque.signature,
                  collection_id: dbTPCollection.id,
                  third_party_id: dbTPCollection.third_party_id,
                  created_at: expect.any(Date),
                  updated_at: expect.any(Date),
                  qty: cheque.qty,
                  salt: cheque.salt,
                })
              })
          })

          it('should create a pending ItemCuration for each item id supplied', () => {
            return server
              .post(buildURL(url))
              .set(authHeaders)
              .send({
                itemIds,
                cheque,
              })
              .expect(200)
              .then(() => {
                const itemCurationCalls = items.map((item) => [
                  {
                    id: expect.any(String),
                    item_id: item.id,
                    status: CurationStatus.PENDING,
                    created_at: expect.any(Date),
                    updated_at: expect.any(Date),
                    content_hash: item.local_content_hash,
                  },
                ])
                expect((ItemCuration.create as jest.Mock).mock.calls).toEqual(
                  itemCurationCalls
                )
              })
          })

          it('should create the virtual collection curation', () => {
            return server
              .post(buildURL(url))
              .set(authHeaders)
              .send({
                itemIds,
                cheque,
              })
              .expect(200)
              .then(() => {
                expect(CollectionCuration.create).toHaveBeenCalledWith({
                  id: expect.any(String),
                  collection_id: dbTPCollection.id,
                  status: CurationStatus.PENDING,
                  created_at: expect.any(Date),
                  updated_at: expect.any(Date),
                  assignee: null,
                })
              })
          })
        })

        describe('and the item collection already has a virtual curation', () => {
          let collectionCuration: CollectionCurationAttributes

          beforeEach(() => {
            ;(Collection.findByIds as jest.Mock).mockResolvedValueOnce([
              dbTPCollection,
            ])
            collectionCuration = { id: uuid() } as CollectionCurationAttributes
            ;(CollectionCuration.findOne as jest.Mock).mockResolvedValueOnce(
              collectionCuration
            )
            ;(CollectionCuration.update as jest.Mock).mockResolvedValueOnce({})
          })

          it('should update the virtual collection curation updated at column', () => {
            return server
              .post(buildURL(url))
              .set(authHeaders)
              .send({
                itemIds,
                cheque,
              })
              .expect(200)
              .then(() => {
                expect(CollectionCuration.update).toHaveBeenCalledWith(
                  { id: collectionCuration.id },
                  { updated_at: expect.any(Date) }
                )
              })
          })
        })

        describe('and the server responds correctly', () => {
          let post: ForumPost
          beforeEach(() => {
            post = {
              raw: 'The raw text from the post',
            } as ForumPost

            // Using CollectionCuration-less items here wihtout any particular reason
            // This describe is here to avoid having to repeat these tests, which run for both casses
            ;(CollectionCuration.findOne as jest.Mock).mockResolvedValueOnce(
              undefined
            )
            ;(CollectionCuration.create as jest.Mock).mockResolvedValueOnce({})
            ;(getPost as jest.Mock).mockResolvedValueOnce(post)
          })

          describe('and the collection is being published for the first time', () => {
            beforeEach(() => {
              ;(Collection.findByIds as jest.Mock).mockResolvedValueOnce([
                dbTPCollection,
              ])
            })
            it('should create a forum post with the response data', () => {
              return server
                .post(buildURL(url))
                .set(authHeaders)
                .send({
                  itemIds,
                  cheque,
                })
                .expect(200)
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
                .send({
                  itemIds,
                  cheque,
                })
                .expect(200)
                .then(() => {
                  expect(Collection.update).toHaveBeenCalledWith(
                    { forum_id: forumId, forum_link: forumLink },
                    { id: dbTPCollection.id }
                  )
                })
            })
            it('should return the collection and items already consolidated', () => {
              return server
                .post(buildURL(url))
                .set(authHeaders)
                .send({
                  itemIds,
                  cheque,
                })
                .expect(200)
                .then((response: any) => {
                  expect(response.body).toEqual({
                    data: {
                      collection: {
                        ...toFullCollection(dbTPCollection),
                        is_published: true,
                        reviewed_at: itemCurationMock.updated_at.toISOString(),
                        created_at: itemCurationMock.created_at.toISOString(),
                        updated_at: itemCurationMock.updated_at.toISOString(),
                      },
                      items: items.map((item) => ({
                        ...item,
                        created_at: item.created_at.toISOString(),
                        updated_at: item.updated_at.toISOString(),
                      })),
                      itemCurations: Array(3).fill({
                        ...itemCurationMock,
                        created_at: itemCurationMock.created_at.toISOString(),
                        updated_at: itemCurationMock.updated_at.toISOString(),
                      }),
                    },
                    ok: true,
                  })
                })
            })
          })

          describe('and the collection has been published before', () => {
            let forumId: number
            beforeEach(() => {
              forumId = 1
              ;(Collection.findByIds as jest.Mock).mockResolvedValueOnce([
                {
                  ...dbTPCollection,
                  forum_id: forumId,
                },
              ])
            })
            it('should update the forum post with the response data', () => {
              return server
                .post(buildURL(url))
                .set(authHeaders)
                .send({
                  itemIds,
                  cheque,
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
      beforeEach(() => {
        url = `/collections/${dbCollection.id}/publish`
        ;(Collection.findByIds as jest.Mock).mockResolvedValueOnce([
          dbCollection,
        ])
        mockExistsMiddleware(Collection, dbCollection.id)
      })

      describe("and the remote collection doesn't exist yet", () => {
        beforeEach(() => {
          ;(Item.findOrderedByCollectionId as jest.Mock).mockResolvedValueOnce(
            []
          )
          ;(collectionAPI.fetchCollection as jest.Mock).mockResolvedValueOnce(
            undefined
          )
        })

        it('should respond with a 401 and a message signaling that the collection was not published yet', () => {
          return server
            .post(buildURL(url))
            .set(createAuthHeaders('post', url))
            .expect(401)
            .then((response: any) => {
              expect(response.body).toEqual({
                error: 'The collection is not published.',
                data: { id: dbCollection.id },
                ok: false,
              })
            })
        })
      })

      describe("and the collection exists and there are items that don't have their blockchain id", () => {
        let anotherDBItem: ItemAttributes

        beforeEach(() => {
          anotherDBItem = {
            ...dbItemMock,
            blockchain_item_id: null,
            created_at: new Date(),
            id: '2f161c60-aee6-4bae-97fa-4642b3680a5c',
          }
          dbItemMock.blockchain_item_id = null
          ;(Item.findOrderedByCollectionId as jest.Mock).mockResolvedValueOnce([
            dbItemMock,
            anotherDBItem,
          ])
          ;(collectionAPI.fetchCollection as jest.Mock).mockResolvedValueOnce(
            collectionFragmentMock
          )
        })

        describe('and some items are missing in the blockchain', () => {
          beforeEach(() => {
            ;(collectionAPI.fetchItemsByContractAddress as jest.MockedFunction<
              typeof collectionAPI.fetchItemsByContractAddress
            >).mockResolvedValueOnce([])
          })

          it("should respond with a 409 and a message signaling that a remote items that matched the stored items couldn't be found", () => {
            return server
              .post(buildURL(url))
              .set(createAuthHeaders('post', url))
              .expect(409)
              .then((response: any) => {
                expect(response.body).toEqual({
                  error: 'The item is not published.',
                  data: { id: dbItemMock.id },
                  ok: false,
                })
              })
          })
        })

        describe('and all the items are in the blockchain', () => {
          beforeEach(() => {
            const anotherItemFragment: ItemFragment = {
              ...itemFragmentMock,
              blockchainId: '1',
            }

            ;(Item.findOrderedByCollectionId as jest.Mock).mockResolvedValueOnce(
              [dbItemMock, anotherDBItem]
            )
            // Items are reverted in order in the response that comes from the graph
            ;(collectionAPI.fetchItemsByContractAddress as jest.MockedFunction<
              typeof collectionAPI.fetchItemsByContractAddress
            >).mockResolvedValueOnce([anotherItemFragment, itemFragmentMock])
            ;(Item.findByBlockchainIdsAndContractAddresses as jest.MockedFunction<
              typeof Item.findByBlockchainIdsAndContractAddresses
            >).mockResolvedValueOnce([dbItemMock, anotherDBItem])
            ;(Collection.findByIds as jest.MockedFunction<
              typeof Collection.findByIds
            >).mockResolvedValueOnce([{ ...dbCollection, item_count: 1 }])
            ;(peerAPI.fetchWearables as jest.MockedFunction<
              typeof peerAPI.fetchWearables
            >).mockResolvedValueOnce([])
          })

          it('should update the items in the DB with the blockchain item id and respond with the updated items', () => {
            return server
              .post(buildURL(url))
              .set(createAuthHeaders('post', url))
              .expect(200)
              .then((response: any) => {
                expect(response.body).toEqual({
                  data: {
                    collection: convertCollectionDatesToISO(
                      toFullCollection(
                        Bridge.mergeCollection(
                          dbCollection,
                          collectionFragmentMock as CollectionFragment
                        )
                      )
                    ),
                    items: [
                      convertItemDatesToISO(
                        Bridge.toFullItem({
                          ...dbItemMock,
                          blockchain_item_id: '0',
                        })
                      ),
                      convertItemDatesToISO(
                        Bridge.toFullItem({
                          ...anotherDBItem,
                          blockchain_item_id: '1',
                        })
                      ),
                    ],
                  },
                  ok: true,
                })

                expect(Item.update).toHaveBeenCalledWith(
                  { blockchain_item_id: '0' },
                  { id: dbItemMock.id }
                )

                expect(Item.update).toHaveBeenCalledWith(
                  { blockchain_item_id: '1' },
                  { id: anotherDBItem.id }
                )
              })
          })
        })
      })
    })
  })

  describe('when getting the collection approval data', () => {
    let url: string

    describe('and the collection is a TP collection', () => {
      beforeEach(() => {
        url = `/collections/${dbTPCollection.id}/approvalData`
      })

      describe('and the user is not a commitee member', () => {
        beforeEach(() => {
          ;(isCommitteeMember as jest.Mock).mockResolvedValueOnce(false)
          ;(Collection.findByIds as jest.Mock).mockResolvedValueOnce([
            dbTPCollection,
          ])
        })

        it('should respond with a 401 and a message signaling that the user is not authorized to upsert the collection', () => {
          return server
            .get(buildURL(url))
            .set(createAuthHeaders('get', url))
            .expect(401)
            .then((response: any) => {
              expect(response.body).toEqual({
                ok: false,
                data: {
                  eth_address: wallet.address,
                },
                error: 'Unauthorized',
              })
            })
        })
      })

      describe('and collection does not exist', () => {
        beforeEach(() => {
          ;(Collection.count as jest.Mock).mockResolvedValueOnce(0)
        })

        it('should respond with a 404 and a message signaling that the collection does not exist', () => {
          return server
            .get(buildURL(url))
            .set(createAuthHeaders('get', url))
            .expect(404)
            .then((response: any) => {
              expect(response.body).toEqual({
                ok: false,
                data: {
                  id: dbTPCollection.id,
                  tableName: Collection.tableName,
                },
                error: `Couldn't find "${dbTPCollection.id}" on ${Collection.tableName}`,
              })
            })
        })
      })

      describe('and the item approval data is empty', () => {
        beforeEach(() => {
          ;(isCommitteeMember as jest.Mock).mockResolvedValueOnce(true)
          ;(Collection.findByIds as jest.Mock).mockResolvedValueOnce([
            dbTPCollection,
          ])
          ;(Item.findDBApprovalDataByCollectionId as jest.Mock).mockResolvedValueOnce(
            []
          )
          ;(SlotUsageCheque.findLastByCollectionId as jest.Mock).mockResolvedValueOnce(
            {}
          )
        })

        it('should respond with a 401 and a message signaling that the collection is not published', () => {
          return server
            .get(buildURL(url))
            .set(createAuthHeaders('get', url))
            .expect(401)
            .then((response: any) => {
              expect(response.body).toEqual({
                ok: false,
                data: {
                  id: dbTPCollection.id,
                },
                error: 'The collection is not published.',
              })
            })
        })
      })

      describe('and the slot usage cheque is missing', () => {
        beforeEach(() => {
          ;(isCommitteeMember as jest.Mock).mockResolvedValueOnce(true)
          ;(Collection.findByIds as jest.Mock).mockResolvedValueOnce([
            dbTPCollection,
          ])
          ;(Item.findDBApprovalDataByCollectionId as jest.Mock).mockResolvedValueOnce(
            [{}]
          )
          ;(SlotUsageCheque.findLastByCollectionId as jest.Mock).mockResolvedValueOnce(
            undefined
          )
        })

        it('should respond with a 401 and a message signaling that the collection is not published', () => {
          return server
            .get(buildURL(url))
            .set(createAuthHeaders('get', url))
            .expect(401)
            .then((response: any) => {
              expect(response.body).toEqual({
                ok: false,
                data: {
                  id: dbTPCollection.id,
                },
                error: 'The collection is not published.',
              })
            })
        })
      })

      describe('and the collection has approval data', () => {
        let itemApprovalData: DBItemApprovalData[]

        describe('when the approval data is missing properties', () => {
          beforeEach(() => {
            itemApprovalData = [
              {
                id: uuid(),
                content_hash: 'Qm1abababa',
              },
              { id: uuid(), content_hash: '' },
              {
                id: uuid(),
                content_hash: 'Qm3rererer',
              },
            ]
            ;(isCommitteeMember as jest.Mock).mockResolvedValueOnce(true)
            ;(Collection.findByIds as jest.Mock).mockResolvedValueOnce([
              dbTPCollection,
            ])
            ;(Item.findDBApprovalDataByCollectionId as jest.Mock).mockResolvedValueOnce(
              itemApprovalData
            )
            ;(SlotUsageCheque.findLastByCollectionId as jest.Mock).mockResolvedValueOnce(
              {}
            )
            thirdPartyAPIMock.fetchThirdParty.mockResolvedValueOnce({
              root: 'aRootValue',
            } as ThirdPartyFragment)
            thirdPartyAPIMock.fetchReceiptById.mockResolvedValueOnce(undefined)
          })

          it('should respond with a 500 saying that the item is missing some properties', () => {
            return server
              .get(buildURL(url))
              .set(createAuthHeaders('get', url))
              .expect(500)
              .then((response: any) => {
                expect(response.body).toEqual({
                  ok: false,
                  data: {
                    id: dbTPCollection.id,
                    eth_address: wallet.address,
                  },
                  error: 'Item missing the content_hash needed to approve it',
                })
              })
          })
        })

        describe('when the approval data and permissions are correct', () => {
          let slotUsageCheque: SlotUsageChequeAttributes

          beforeEach(() => {
            itemApprovalData = [
              {
                id: uuid(),
                content_hash: 'Qm1abababa',
              },
              {
                id: uuid(),
                content_hash: 'Qm2bdbdbdb',
              },
              {
                id: uuid(),
                content_hash: 'Qm3rererer',
              },
            ]

            slotUsageCheque = {
              ...mockedCheque,
              third_party_id: dbTPCollection.third_party_id,
            } as SlotUsageChequeAttributes
            ;(isCommitteeMember as jest.Mock).mockResolvedValueOnce(true)
            ;(Collection.findByIds as jest.Mock).mockResolvedValueOnce([
              dbTPCollection,
            ])
            ;(Item.findDBApprovalDataByCollectionId as jest.Mock).mockResolvedValueOnce(
              itemApprovalData
            )
            ;(SlotUsageCheque.findLastByCollectionId as jest.Mock).mockResolvedValueOnce(
              slotUsageCheque
            )
          })

          describe("and the cheque doesn't exist in the blockcahin", () => {
            beforeEach(() => {
              thirdPartyAPIMock.fetchReceiptById.mockResolvedValueOnce(
                undefined
              )
              thirdPartyAPIMock.fetchThirdParty.mockResolvedValueOnce({
                root: 'aRootValue',
              } as ThirdPartyFragment)
            })

            it('should return an array with the data for pending curations, indicating that the cheque was not used', () => {
              return server
                .get(buildURL(url))
                .set(createAuthHeaders('get', url))
                .expect(200)
                .then((response: any) => {
                  expect(response.body).toEqual({
                    ok: true,
                    data: {
                      cheque: {
                        qty: slotUsageCheque.qty,
                        salt: slotUsageCheque.salt,
                        signature: slotUsageCheque.signature,
                      },
                      content_hashes: {
                        [itemApprovalData[0].id]: 'Qm1abababa',
                        [itemApprovalData[1].id]: 'Qm2bdbdbdb',
                        [itemApprovalData[2].id]: 'Qm3rererer',
                      },
                      chequeWasConsumed: false,
                      root: 'aRootValue',
                    },
                  })
                })
            })
          })

          describe('and the cheque exists in the blockchain', () => {
            beforeEach(() => {
              thirdPartyAPIMock.fetchReceiptById.mockResolvedValueOnce({
                id:
                  '0x7954b5d263d7d1298c98fa330de6a0d94952bb5f6694cab0dde144239d56dce1',
              } as ReceiptFragment)
              thirdPartyAPIMock.fetchThirdParty.mockResolvedValueOnce({
                root: 'aRootValue',
              } as ThirdPartyFragment)
            })

            it('should return an array with the data for pending curations, indicating that the cheque was used', () => {
              return server
                .get(buildURL(url))
                .set(createAuthHeaders('get', url))
                .expect(200)
                .then((response: any) => {
                  expect(response.body).toEqual({
                    ok: true,
                    data: {
                      cheque: {
                        qty: slotUsageCheque.qty,
                        salt: slotUsageCheque.salt,
                        signature: slotUsageCheque.signature,
                      },
                      content_hashes: {
                        [itemApprovalData[0].id]: 'Qm1abababa',
                        [itemApprovalData[1].id]: 'Qm2bdbdbdb',
                        [itemApprovalData[2].id]: 'Qm3rererer',
                      },
                      chequeWasConsumed: true,
                      root: 'aRootValue',
                    },
                  })
                })
            })
          })
        })
      })
    })

    describe('and the collection is not a TP collection', () => {
      beforeEach(() => {
        url = `/collections/${dbCollection.id}/approvalData`
        ;(isCommitteeMember as jest.Mock).mockResolvedValueOnce(true)
        ;(Collection.findByIds as jest.Mock).mockResolvedValueOnce([
          dbCollection,
        ])
        ;(SlotUsageCheque.findLastByCollectionId as jest.Mock).mockResolvedValueOnce(
          {}
        )
      })

      it('should respond with a 409 and a message signaling that the collection is not third party', () => {
        return server
          .get(buildURL(url))
          .set(createAuthHeaders('get', url))
          .expect(409)
          .then((response: any) => {
            expect(response.body).toEqual({
              ok: false,
              data: {
                id: dbCollection.id,
              },
              error: 'Collection is not Third Party',
            })
          })
      })
    })
  })
})
