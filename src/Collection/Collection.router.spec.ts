import supertest from 'supertest'
import {
  createAuthHeaders,
  buildURL,
  mockExistsMiddleware,
  mockOwnableCanUpsert,
  mockCollectionAuthorizationMiddleware,
  mockIsCollectionPublished,
  mockThirdPartyCollectionWithItems,
} from '../../spec/utils'
import {
  collectionAttributesMock,
  collectionDataMock,
  collectionFragment,
  convertCollectionDatesToISO,
  ResultCollection,
  toResultCollection,
} from '../../spec/mocks/collections'
import { wallet } from '../../spec/mocks/wallet'
import { collectionAPI } from '../ethereum/api/collection'
import { isCommitteeMember } from '../Committee'
import { app } from '../server'
import { CollectionFragment } from '../ethereum/api/fragments'
import { Item } from '../Item/Item.model'
import { hasAccess } from './access'
import { toDBCollection, toFullCollection } from './utils'
import {
  convertItemDatesToISO,
  dbItemMock,
  itemFragmentMock,
} from '../../spec/mocks/items'
import { ItemAttributes } from '../Item'
import { ItemFragment } from '../ethereum/api/fragments'
import { Bridge } from '../ethereum/api/Bridge'
import { peerAPI } from '../ethereum/api/peer'
import { Collection } from './Collection.model'
import { CollectionAttributes, FullCollection } from './Collection.types'
import { thirdPartyAPI } from '../ethereum/api/thirdParty'

const server = supertest(app.getApp())
jest.mock('../ethereum/api/collection')
jest.mock('../ethereum/api/peer')
jest.mock('../ethereum/api/thirdParty')
jest.mock('../Item/Item.model')
jest.mock('../Committee')
jest.mock('../Ownable')
jest.mock('../utils/eth')
jest.mock('./Collection.model')
jest.mock('./access')

describe('Collection router', () => {
  let dbCollection: CollectionAttributes
  let resultingCollectionAttributes: ResultCollection
  let url: string

  beforeEach(() => {
    dbCollection = { ...collectionAttributesMock }
    resultingCollectionAttributes = toResultCollection(dbCollection)
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when upserting a collection', () => {
    const network = 'ropsten'
    const urn_suffix = 'a-urn-suffix'
    const thirdPartySuffix = 'a-thirdparty-id'
    const baseThirdPartyId = 'urn:decentraland:ropsten:collections-thirdparty'
    const third_party_id = `${baseThirdPartyId}:${thirdPartySuffix}`
    let urn: string
    let collectionToUpsert: FullCollection
    beforeEach(() => {
      url = `/collections/${dbCollection.id}`
    })

    describe('and the collection id is different than the one provided as the collection data', () => {
      let otherId: string
      beforeEach(() => {
        otherId = 'bec9eb58-2ac0-11ec-8d3d-0242ac130003'
        collectionToUpsert = {
          ...toFullCollection(collectionAttributesMock),
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
      let dbTPCollection: CollectionAttributes
      beforeEach(() => {
        urn = `${third_party_id}:${urn_suffix}`
        dbTPCollection = {
          ...dbCollection,
          eth_address: '',
          urn_suffix,
          third_party_id,
          contract_address: '',
        }
        collectionToUpsert = {
          ...toFullCollection(dbTPCollection),
          urn,
        }
      })

      describe('and the user is not a manager of the third party collection', () => {
        beforeEach(() => {
          ;(isManager as jest.MockedFunction<
            typeof isManager
          >).mockResolvedValueOnce(false)
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

      describe("and the upserted collection wasn't a third party collection before", () => {
        beforeEach(() => {
          ;(thirdPartyAPI.isManager as jest.MockedFunction<
            typeof thirdPartyAPI.isManager
          >).mockResolvedValueOnce(true)
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

      describe('and the usperted collection is changing the urn and it already has items published', () => {
        beforeEach(() => {
          dbTPCollection = {
            ...dbTPCollection,
            urn_suffix: 'old-urn-suffix',
            third_party_id,
          }
          ;(thirdPartyAPI.isManager as jest.MockedFunction<
            typeof thirdPartyAPI.isManager
          >).mockResolvedValueOnce(true)
          ;(Collection.findOne as jest.Mock).mockResolvedValueOnce(
            dbTPCollection
          )
        })

        describe('and it already has items published', () => {
          beforeEach(() => {
            mockThirdPartyCollectionWithItems(
              dbTPCollection.third_party_id!,
              dbTPCollection.urn_suffix!,
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
                  },
                  error:
                    "The third party collection already has published items. It can't be updated or inserted.",
                })
              })
          })
        })

        describe("and it doesn't have items already published but the new urn points to a collection that does", () => {
          beforeEach(() => {
            mockThirdPartyCollectionWithItems(
              dbTPCollection.third_party_id!,
              dbTPCollection.urn_suffix!,
              false
            )

            mockThirdPartyCollectionWithItems(third_party_id, urn_suffix!, true)
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
      })

      describe('and the collection exists and is locked', () => {
        beforeEach(() => {
          ;(thirdPartyAPI.isManager as jest.MockedFunction<
            typeof thirdPartyAPI.isManager
          >).mockResolvedValueOnce(true)
          const currentDate = Date.now()
          jest.spyOn(Date, 'now').mockReturnValueOnce(currentDate)
          ;(Collection.findOne as jest.Mock).mockResolvedValueOnce({
            ...dbTPCollection,
            lock: new Date(currentDate),
          })
          ;(Collection.prototype.upsert as jest.MockedFunction<
            typeof Collection.prototype.upsert
          >).mockResolvedValueOnce({
            ...dbTPCollection,
            lock: new Date(currentDate),
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
                error: "The collection is locked. It can't be saved.",
              })
            })
        })
      })

      describe('and the collection exists and is not locked', () => {
        let upsertMock: jest.Mock
        let newCollectionAttributes: CollectionAttributes
        beforeEach(() => {
          upsertMock = jest.fn()
          ;(thirdPartyAPI.isManager as jest.MockedFunction<
            typeof thirdPartyAPI.isManager
          >).mockResolvedValueOnce(true)
          ;(Collection.findOne as jest.Mock).mockResolvedValueOnce(
            dbTPCollection
          )
          ;((Collection as unknown) as jest.Mock).mockImplementationOnce(
            (attributes) => {
              newCollectionAttributes = attributes
              upsertMock.mockResolvedValueOnce(attributes)
              return {
                upsert: upsertMock,
              }
            }
          )
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
                data: toFullCollection(newCollectionAttributes),
              })

              expect(newCollectionAttributes).toEqual(
                convertCollectionDatesToISO(toDBCollection(collectionToUpsert))
              )
            })
        })
      })

      describe("and the collection doesn't exist", () => {
        beforeEach(() => {
          ;(isManager as jest.Mock).mockReturnValueOnce(true)
          ;(Collection.findOne as jest.Mock).mockResolvedValueOnce(null)
        })

        describe('and there are items already published with the collection id', () => {
          beforeEach(() => {
            mockThirdPartyCollectionWithItems(third_party_id, urn_suffix, true)
          })

          it('should respond with a 409 and a message saying that the collection has already been published', () => {
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

        describe("and there aren't any items published with the collection id", () => {
          let upsertMock: jest.Mock
          let newCollectionAttributes: CollectionAttributes
          beforeEach(() => {
            upsertMock = jest.fn()
            mockThirdPartyCollectionWithItems(third_party_id, urn_suffix, false)
            ;((Collection as unknown) as jest.Mock).mockImplementationOnce(
              (attributes) => {
                newCollectionAttributes = attributes
                upsertMock.mockResolvedValueOnce(attributes)
                return {
                  upsert: upsertMock,
                }
              }
            )
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
                  data: toFullCollection(newCollectionAttributes),
                })

                expect(newCollectionAttributes).toEqual(
                  convertCollectionDatesToISO(
                    toDBCollection(collectionToUpsert)
                  )
                )
              })
          })
        })
      })
    })

    describe('when the collection is a decentraland collection', () => {
      beforeEach(() => {
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
                error:
                  'Can not change the is_published or is_approved property',
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
                error:
                  'Can not change the is_published or is_approved property',
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
                error: "The collection is published. It can't be saved.",
              })
            })
        })
      })

      describe('and the collection already already exists and is locked', () => {
        beforeEach(() => {
          const currentDate = Date.now()
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
                error: "The collection is locked. It can't be saved.",
              })
            })
        })
      })

      describe('and the collection is upserted', () => {
        let newCollectionAttributes: CollectionAttributes
        let upsertMock: jest.Mock
        beforeEach(() => {
          upsertMock = jest.fn()
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
          ;((Collection as unknown) as jest.Mock).mockImplementationOnce(
            (attributes) => {
              newCollectionAttributes = attributes
              upsertMock.mockResolvedValueOnce(attributes)
              return {
                upsert: upsertMock,
              }
            }
          )
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
                data: toFullCollection(newCollectionAttributes),
              })

              expect(newCollectionAttributes).toEqual({
                ...convertCollectionDatesToISO(
                  toDBCollection(collectionToUpsert)
                ),
                contract_address: expect.any(String),
                salt: expect.any(String),
              })
            })
        })
      })
    })
  })

  describe('when retrieving all the collections', () => {
    beforeEach(() => {
      ;(isCommitteeMember as jest.Mock).mockResolvedValueOnce(true)
      ;(Collection.find as jest.Mock)
        .mockResolvedValueOnce([dbCollection])
        .mockResolvedValueOnce([])
      ;(Collection.findByContractAddresses as jest.Mock).mockResolvedValueOnce(
        []
      )
      ;(collectionAPI.fetchCollections as jest.Mock).mockResolvedValueOnce([])
      url = `/collections`
    })

    it('should respond with all the collections with the URN', () => {
      return server
        .get(buildURL(url))
        .set(createAuthHeaders('get', url))
        .expect(200)
        .then((response: any) => {
          expect(response.body).toEqual({
            data: [
              {
                ...resultingCollectionAttributes,
                urn: `urn:decentraland:ropsten:collections-v2:${dbCollection.contract_address}`,
              },
            ],
            ok: true,
          })
        })
    })
  })

  describe('when retrieving the collections of an address', () => {
    let thirdPartyDbCollection: CollectionAttributes

    beforeEach(() => {
      thirdPartyDbCollection = {
        ...collectionAttributesMock,
        urn_suffix: 'thesuffix',
        third_party_id: 'some:third-party-id',
      }
      ;(Collection.find as jest.Mock).mockReturnValueOnce([dbCollection])
      ;(Collection.findByContractAddresses as jest.Mock).mockReturnValueOnce([])
      ;(Collection.findByThirdPartyIds as jest.Mock).mockReturnValueOnce([
        thirdPartyDbCollection,
      ])
      ;(collectionAPI.fetchCollectionsByAuthorizedUser as jest.Mock).mockReturnValueOnce(
        []
      )
      ;(thirdPartyAPI.fetchThirdPartyIds as jest.Mock).mockReturnValueOnce([
        { id: thirdPartyDbCollection.id },
      ])
      url = `/${wallet.address}/collections`
    })

    it('should return the requested collections with the URN', () => {
      return server
        .get(buildURL(url))
        .set(createAuthHeaders('get', url))
        .expect(200)
        .then((response: any) => {
          expect(response.body).toEqual({
            data: [
              {
                ...resultingCollectionAttributes,
                urn: `urn:decentraland:ropsten:collections-v2:${dbCollection.contract_address}`,
              },
              {
                ...toResultCollection(thirdPartyDbCollection),
                owner: wallet.address,
                urn: `urn:decentraland:ropsten:collections-thirdparty:${thirdPartyDbCollection.third_party_id}:${thirdPartyDbCollection.urn_suffix}`,
              },
            ],
            ok: true,
          })
        })
    })
  })

  describe('when retrieving a single collection', () => {
    beforeEach(() => {
      mockExistsMiddleware(Collection, dbCollection.id)
      ;(hasAccess as jest.Mock).mockResolvedValueOnce(true)
      ;(Collection.findOne as jest.Mock).mockReturnValueOnce(dbCollection)
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
              urn: `urn:decentraland:ropsten:collections-v2:${dbCollection.contract_address}`,
            },
            ok: true,
          })
          expect(Collection.findOne).toHaveBeenCalledWith(dbCollection.id)
        })
    })
  })

  describe('when locking a collection', () => {
    const now = 1633022119407
    beforeEach(() => {
      jest.spyOn(Date, 'now').mockReturnValueOnce(now)
      mockExistsMiddleware(Collection, dbCollection.id)
      mockCollectionAuthorizationMiddleware(dbCollection.id, wallet.address)
      ;(Collection.findOne as jest.MockedFunction<
        typeof Collection.findOne
      >).mockResolvedValueOnce(dbCollection)
      url = `/collections/${dbCollection.id}/lock`
    })

    afterEach(() => {
      ;(Date.now as jest.Mock).mockRestore()
    })

    describe('when the lock update succeeds', () => {
      it('should update the lock with .now() on the supplied collection id for the owner', () => {
        const lock = new Date(now)
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
        ;(Collection.findOne as jest.MockedFunction<
          typeof Collection.findOne
        >).mockResolvedValueOnce(dbCollection)
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
    beforeEach(() => {
      url = `/collections/${dbCollection.id}`
    })

    describe('and the collection is a TP collection', () => {
      beforeEach(() => {
        dbCollection.urn_suffix = 'collection-urn-suffix'
        dbCollection.third_party_id = 'third-party-id'
        mockExistsMiddleware(Collection, dbCollection.id)
      })

      describe('and the user is not a manager of the TP collection', () => {
        beforeEach(() => {
          mockCollectionAuthorizationMiddleware(
            dbCollection.id,
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
                error: `Unauthorized user ${wallet.address} for collections ${dbCollection.id}`,
              })
            })
        })
      })

      describe('and the user is a manager of the TP collection', () => {
        beforeEach(() => {
          mockCollectionAuthorizationMiddleware(
            dbCollection.id,
            wallet.address,
            true
          )
          ;(Collection.findOne as jest.MockedFunction<
            typeof Collection.findOne
          >).mockResolvedValueOnce(dbCollection)
        })

        describe('and it has third party items already published', () => {
          beforeEach(() => {
            mockThirdPartyCollectionWithItems(
              dbCollection.third_party_id!,
              dbCollection.urn_suffix!,
              true
            )
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
                    id: dbCollection.id,
                  },
                  ok: false,
                })
              })
          })
        })

        describe('and it is locked', () => {
          beforeEach(() => {
            const lockDate = new Date()
            dbCollection.lock = lockDate
            mockThirdPartyCollectionWithItems(
              dbCollection.third_party_id!,
              dbCollection.urn_suffix!,
              false
            )
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
                    id: dbCollection.id,
                  },
                  ok: false,
                })
              })
          })
        })

        describe('and its neither locked nor some of its items published', () => {
          beforeEach(() => {
            const lockDate = new Date()
            dbCollection.lock = lockDate
            mockThirdPartyCollectionWithItems(
              dbCollection.third_party_id!,
              dbCollection.urn_suffix!,
              false
            )
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

    describe('and the collection is a DCL collection', () => {
      beforeEach(() => {
        dbCollection.urn_suffix = null
        mockExistsMiddleware(Collection, dbCollection.id)
        mockCollectionAuthorizationMiddleware(dbCollection.id, wallet.address)
        ;(Collection.findOne as jest.MockedFunction<
          typeof Collection.findOne
        >).mockResolvedValueOnce(dbCollection)
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
    beforeEach(() => {
      url = `/collections/${dbCollection.id}/publish`
      mockExistsMiddleware(Collection, dbCollection.id)
      ;(Collection.findOne as jest.Mock).mockResolvedValueOnce(dbCollection)
    })

    describe("and the remote collection doesn't exist yet", () => {
      beforeEach(() => {
        ;(Item.findOrderedItemsByCollectionId as jest.Mock).mockResolvedValueOnce(
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
              error: 'The collection is not published yet',
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
        ;(Item.findOrderedItemsByCollectionId as jest.Mock).mockResolvedValueOnce(
          [dbItemMock, anotherDBItem]
        )
        ;(collectionAPI.fetchCollection as jest.Mock).mockResolvedValueOnce(
          collectionFragment
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
                error:
                  "An item couldn't be matched with the one in the blockchain",
                data: { itemId: dbItemMock.id, collectionId: dbCollection.id },
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

          ;(Item.findOrderedItemsByCollectionId as jest.Mock).mockResolvedValueOnce(
            [dbItemMock, anotherDBItem]
          )
          // Items are reverted in order in the response that comes from the graph
          ;(collectionAPI.fetchItemsByContractAddress as jest.MockedFunction<
            typeof collectionAPI.fetchItemsByContractAddress
          >).mockResolvedValueOnce([anotherItemFragment, itemFragmentMock])
          ;(Collection.findByContractAddresses as jest.MockedFunction<
            typeof Collection.findByContractAddresses
          >).mockResolvedValueOnce([dbCollection])
          ;(Item.findByBlockchainIdsAndContractAddresses as jest.MockedFunction<
            typeof Item.findByBlockchainIdsAndContractAddresses
          >).mockResolvedValueOnce([dbItemMock, anotherDBItem])
          ;(Collection.findByIds as jest.MockedFunction<
            typeof Collection.findByIds
          >).mockResolvedValueOnce([dbCollection])
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
                  collection: [
                    convertCollectionDatesToISO(toFullCollection(dbCollection)),
                  ],
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
