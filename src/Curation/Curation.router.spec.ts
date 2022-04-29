import { ExpressApp } from '../common/ExpressApp'
import {
  collectionFragmentMock,
  dbCollectionMock,
  dbTPCollectionMock,
} from '../../spec/mocks/collections'
import { itemCurationMock } from '../../spec/mocks/itemCuration'
import { dbItemMock, thirdPartyItemFragmentMock } from '../../spec/mocks/items'
import { thirdPartyAPI } from '../ethereum/api/thirdParty'
import { collectionAPI } from '../ethereum/api/collection'
import { toUnixTimestamp } from '../utils/parse'
import { Collection } from '../Collection'
import { Item, ItemAttributes } from '../Item'
import { isCommitteeMember } from '../Committee'
import { AuthRequest } from '../middleware'
import { CurationRouter } from './Curation.router'
import {
  CollectionCuration,
  CollectionCurationAttributes,
} from './CollectionCuration'
import { ItemCuration, ItemCurationAttributes } from './ItemCuration'
import { CurationService } from './Curation.service'
import { CurationStatus } from './Curation.types'
import { createAssigneeEventPost, ForumNewPost } from '../Forum'

jest.mock('../common/Router')
jest.mock('../common/ExpressApp')
jest.mock('../Committee')
jest.mock('../Curation/ItemCuration')
jest.mock('../Forum')

const mockIsCommitteeMember = isCommitteeMember as jest.Mock
const mockCreateAssigneeEventPost = createAssigneeEventPost as jest.Mock

const mockAddress = '0x6D7227d6F36FC997D53B4646132b3B55D751cc7c'

describe('when handling a request', () => {
  let router: CurationRouter

  function mockServiceWithAccess(
    CurationModel: typeof CollectionCuration | typeof ItemCuration,
    hasAccess: boolean
  ) {
    const service = mockService(CurationModel)
    jest.spyOn(service, 'hasAccess').mockResolvedValueOnce(hasAccess)
    return service
  }

  function mockService(
    CurationModel: typeof CollectionCuration | typeof ItemCuration
  ) {
    const service = new CurationService(CurationModel)
    jest.spyOn(CurationService, 'byType').mockReturnValueOnce(service)
    return service
  }

  beforeEach(() => {
    router = new CurationRouter(new ExpressApp())
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('when trying to obtain the curation stats for each item on a collection', () => {
    let req: AuthRequest

    beforeEach(() => {
      req = {
        auth: { ethAddress: 'ethAddress' },
        params: { id: 'collectionId' },
      } as any
    })

    describe('when the address does not have access to the collection', () => {
      beforeEach(() => {
        mockServiceWithAccess(CollectionCuration, false)
      })

      it('should reject with an unauthorized message', async () => {
        await expect(
          router.getCollectionCurationItemStats(req)
        ).rejects.toThrowError('Unauthorized')
      })
    })

    describe('when the collection id does not belong to a TP collection', () => {
      beforeEach(() => {
        mockServiceWithAccess(CollectionCuration, true)

        jest
          .spyOn(Collection, 'findOne')
          .mockResolvedValueOnce(dbCollectionMock)
      })

      it('should reject with an unauthorized message', async () => {
        await expect(
          router.getCollectionCurationItemStats(req)
        ).rejects.toThrowError('Collection is not a third party collection')
      })
    })

    describe('when it is fetching items from a managed TP collection', () => {
      let fetchItemsByCollectionSpy: jest.SpyInstance<
        ReturnType<typeof thirdPartyAPI['fetchItemsByCollection']>
      >

      beforeEach(() => {
        mockServiceWithAccess(CollectionCuration, true)

        jest
          .spyOn(Collection, 'findOne')
          .mockResolvedValueOnce(dbTPCollectionMock)

        fetchItemsByCollectionSpy = fetchItemsByCollectionSpy = jest
          .spyOn(thirdPartyAPI, 'fetchItemsByCollection')
          .mockResolvedValueOnce([
            { ...thirdPartyItemFragmentMock }, // approved
            { ...thirdPartyItemFragmentMock }, // approved
            {
              ...thirdPartyItemFragmentMock,
              isApproved: false,
              reviewedAt: toUnixTimestamp(new Date()),
            }, // rejected
            { ...thirdPartyItemFragmentMock, isApproved: false }, // under review
            { ...thirdPartyItemFragmentMock, isApproved: false }, // under review
          ])
      })

      it('should fetch the items for the collection id and its third party id', async () => {
        await router.getCollectionCurationItemStats(req)
        expect(fetchItemsByCollectionSpy).toHaveBeenCalledWith(
          dbTPCollectionMock.third_party_id,
          req.params.id
        )
      })

      it('should use the fetched items to count and return an object with the values', async () => {
        const stats = await router.getCollectionCurationItemStats(req)
        expect(stats).toEqual({
          total: 5,
          approved: 2,
          rejected: 1,
          needsReview: 2,
        })
      })
    })
  })

  describe('when trying to obtain a list of collection curations', () => {
    let service: CurationService<any>

    describe('when the caller belongs to the committee', () => {
      beforeEach(() => {
        service = mockService(CollectionCuration)
        mockIsCommitteeMember.mockResolvedValueOnce(true)
      })

      it('should resolve with the collections provided by Curation.getLatest', async () => {
        const getAllLatestSpy = jest
          .spyOn(service, 'getLatest')
          .mockResolvedValueOnce([])

        const req = {
          auth: { ethAddress: 'ethAddress' },
        } as AuthRequest

        await router.getCollectionCurations(req)

        expect(getAllLatestSpy).toHaveBeenCalled()
      })
    })

    describe('when the caller does not belong to the committee', () => {
      beforeEach(() => {
        service = mockService(CollectionCuration)
        mockIsCommitteeMember.mockResolvedValueOnce(false)
      })

      it('should resolve with the collections provided by Curation.getLatestByIds', async () => {
        const fetchCollectionsByAuthorizedUserSpy = jest
          .spyOn(collectionAPI, 'fetchCollectionsByAuthorizedUser')
          .mockResolvedValueOnce([
            { id: 'contractAddress1' },
            { id: 'contractAddress2' },
          ] as any)

        const findByContractAddressesSpy = jest
          .spyOn(Collection, 'findByContractAddresses')
          .mockResolvedValueOnce([
            { id: 'collectionId1' },
            { id: 'collectionId2' },
          ] as any)

        jest
          .spyOn(thirdPartyAPI, 'fetchThirdPartiesByManager')
          .mockResolvedValueOnce([{ id: 'thirdPartyRecordId' } as any])

        const findByThirdPartyIdsSpy = jest
          .spyOn(Collection, 'findByThirdPartyIds')
          .mockResolvedValueOnce([
            { id: 'tpCollectionId1' },
            { id: 'tpCollectionId2' },
          ] as any)

        const getLatestByIdsCollectionsSpy = jest
          .spyOn(service, 'getLatestByIds')
          .mockResolvedValueOnce([])

        const req = {
          auth: { ethAddress: 'ethAddress' },
        } as AuthRequest

        await router.getCollectionCurations(req)

        expect(fetchCollectionsByAuthorizedUserSpy).toHaveBeenCalledWith(
          'ethAddress'
        )

        expect(findByContractAddressesSpy).toHaveBeenCalledWith([
          'contractAddress1',
          'contractAddress2',
        ])

        expect(findByThirdPartyIdsSpy).toHaveBeenCalledWith([
          'thirdPartyRecordId',
        ])

        expect(getLatestByIdsCollectionsSpy).toHaveBeenCalledWith([
          'collectionId1',
          'collectionId2',
          'tpCollectionId1',
          'tpCollectionId2',
        ])
      })
    })
  })

  describe('when trying to obtain a list of item curations', () => {
    let itemIds: string[]
    let itemCuration: ItemCurationAttributes
    let req: AuthRequest

    beforeEach(() => {
      mockServiceWithAccess(ItemCuration, true)
      itemIds = ['1', '2', '3']
      itemCuration = { ...itemCurationMock }
    })

    describe('when itemIds param is not provided', () => {
      beforeEach(() => {
        ;(ItemCuration.findByCollectionId as jest.Mock).mockResolvedValueOnce([
          itemCuration,
        ])
        req = ({
          params: { id: 'collectionId' },
          auth: { ethAddress: 'ethAddress' },
        } as unknown) as AuthRequest
      })

      it('should resolve with the collections provided by ItemCuration.findByCollectionId', async () => {
        const itemCurations = await router.getCollectionItemCurations(req)
        expect(itemCurations).toStrictEqual([itemCuration])
      })
    })

    describe('when itemIds param is provided', () => {
      beforeEach(() => {
        ;(ItemCuration.findByCollectionAndItemIds as jest.Mock).mockResolvedValueOnce(
          [itemCuration]
        )
        req = ({
          params: { id: 'collectionId', itemIds },
          auth: { ethAddress: 'ethAddress' },
        } as unknown) as AuthRequest
      })

      it('should resolve with the collections provided by ItemCuration.findByCollectionAndItemIds', async () => {
        const itemCurations = await router.getCollectionItemCurations(req)
        expect(itemCurations).toStrictEqual([itemCuration])
      })
    })
  })

  describe('when trying to obtain the latest curation for a collection', () => {
    let service: CurationService<any>
    let req: AuthRequest

    beforeEach(() => {
      req = {
        auth: { ethAddress: 'ethAddress' },
        params: { id: 'collectionId' },
      } as any
    })

    describe('when the caller has no access', () => {
      beforeEach(() => {
        service = mockServiceWithAccess(CollectionCuration, false)
      })

      it('should reject with an unauthorized message', async () => {
        await expect(router.getCollectionCuration(req)).rejects.toThrowError(
          'Unauthorized'
        )
      })
    })

    describe('when everything is correct', () => {
      beforeEach(() => {
        service = mockServiceWithAccess(CollectionCuration, true)
        jest.spyOn(service, 'getLatestById').mockResolvedValueOnce({})
      })

      it('should resolve with the expected curation', async () => {
        expect(await router.getCollectionCuration(req)).toEqual({})
      })
    })
  })

  describe('when trying to update a curation', () => {
    let service: CurationService<any>

    describe('when the caller has no access to the collection', () => {
      let req: AuthRequest

      beforeEach(() => {
        req = {
          auth: { ethAddress: 'ethAddress' },
          params: { id: 'some id' },
          body: { curation: {} },
        } as any
      })

      describe('when updating a collection curation', () => {
        beforeEach(() => {
          service = mockServiceWithAccess(CollectionCuration, false)
        })

        it('should reject with an unauthorized message', async () => {
          await expect(
            router.updateCollectionCuration(req)
          ).rejects.toThrowError('Unauthorized')
        })
      })

      describe('when updating an item curation', () => {
        beforeEach(() => {
          service = mockServiceWithAccess(ItemCuration, false)

          jest
            .spyOn(CollectionCuration, 'updateByItemId')
            .mockResolvedValueOnce({ rowCount: 1 })
        })

        it('should reject with an unauthorized message', async () => {
          await expect(router.updateItemCuration(req)).rejects.toThrowError(
            'Unauthorized'
          )
        })
      })
    })

    describe('when the payload is invalid', () => {
      let req: AuthRequest

      beforeEach(() => {
        req = {
          auth: { ethAddress: 'ethAddress' },
          params: { id: 'some id' },
          body: { curation: { nonsense: 2 } },
        } as any
      })

      describe('when updating a collection curation', () => {
        beforeEach(() => {
          service = mockServiceWithAccess(CollectionCuration, true)
        })

        it('should reject with invalid schema message', async () => {
          await expect(router.updateCollectionCuration(req)).rejects.toThrow(
            'Invalid schema'
          )
        })
      })

      describe('when updating an item curation', () => {
        beforeEach(() => {
          service = mockServiceWithAccess(ItemCuration, true)

          jest
            .spyOn(CollectionCuration, 'updateByItemId')
            .mockResolvedValueOnce({ rowCount: 1 })
        })

        it('should reject with invalid schema message', async () => {
          await expect(router.updateItemCuration(req)).rejects.toThrow(
            'Invalid schema'
          )
        })
      })
    })

    describe('when the item curation does not have a valid collection curation', () => {
      let req: AuthRequest

      beforeEach(() => {
        req = {
          auth: { ethAddress: 'ethAddress' },
          params: { id: 'some id' },
          body: {
            curation: {
              status: CurationStatus.APPROVED,
            },
          },
        } as any

        service = mockServiceWithAccess(ItemCuration, true)

        jest
          .spyOn(CollectionCuration, 'updateByItemId')
          .mockResolvedValueOnce({ rowCount: 0 })
      })

      it("should respond with a 404 and a message signaling that the collection curation can't be found", async () => {
        await expect(router.updateItemCuration(req)).rejects.toThrow(
          'Could not find a valid collection curation for the item'
        )
      })
    })

    describe('when the curation does not exist', () => {
      let req: AuthRequest

      beforeEach(() => {
        req = {
          auth: { ethAddress: 'ethAddress' },
          params: { id: 'some id' },
          body: {
            curation: {
              status: CurationStatus.REJECTED,
            },
          },
        } as any
      })

      describe('when updating a collection curation', () => {
        beforeEach(() => {
          service = mockServiceWithAccess(CollectionCuration, true)
          jest.spyOn(service, 'getLatestById').mockResolvedValueOnce(undefined)
        })

        it('should reject with curation not found message', async () => {
          await expect(router.updateCollectionCuration(req)).rejects.toThrow(
            'Curation does not exist'
          )
        })
      })

      describe('when updating an item curation', () => {
        beforeEach(() => {
          service = mockServiceWithAccess(ItemCuration, true)
          jest.spyOn(service, 'getLatestById').mockResolvedValueOnce(undefined)
          jest
            .spyOn(CollectionCuration, 'updateByItemId')
            .mockResolvedValueOnce({ rowCount: 1 })
        })

        it('should reject with curation not found message', async () => {
          await expect(router.updateItemCuration(req)).rejects.toThrow(
            'Curation does not exist'
          )
        })
      })
    })

    describe('when everything is fine', () => {
      let req: AuthRequest
      describe('when updating a collection curation', () => {
        let updateSpy: jest.SpyInstance<Promise<ItemAttributes>>
        let expectedCuration: CollectionCurationAttributes

        describe('and it only updates the status', () => {
          beforeEach(() => {
            req = {
              auth: { ethAddress: 'ethAddress' },
              params: { id: 'some id' },
              body: {
                curation: {
                  status: CurationStatus.REJECTED,
                },
              },
            } as any
            service = mockServiceWithAccess(CollectionCuration, true)
            expectedCuration = {
              id: 'uuid-123123-123123',
            } as CollectionCurationAttributes

            jest
              .spyOn(service, 'getLatestById')
              .mockResolvedValueOnce({ id: 'curationId' } as any)

            jest
              .spyOn(service, 'updateById')
              .mockResolvedValueOnce(expectedCuration)

            updateSpy = jest
              .spyOn(service, 'updateById')
              .mockResolvedValueOnce(expectedCuration)
          })

          it('should resolve with the updated curation', async () => {
            await expect(
              router.updateCollectionCuration(req)
            ).resolves.toStrictEqual(expectedCuration)
          })

          it('should call the update method with the right data', async () => {
            await router.updateCollectionCuration(req)

            expect(updateSpy).toHaveBeenCalledWith('curationId', {
              status: CurationStatus.REJECTED,
              updated_at: expect.any(Date),
            })
          })
        })

        describe('and it only updates the assignee', () => {
          let assignee: string
          beforeEach(() => {
            assignee = mockAddress
            req = {
              auth: { ethAddress: 'ethAddress' },
              params: { id: 'some id' },
              body: {
                curation: {
                  assignee,
                },
              },
            } as any
            service = mockServiceWithAccess(CollectionCuration, true)
            expectedCuration = {
              id: 'uuid-123123-123123',
            } as CollectionCurationAttributes

            jest
              .spyOn(service, 'getLatestById')
              .mockResolvedValueOnce({ id: 'curationId' } as any)

            jest
              .spyOn(service, 'updateById')
              .mockResolvedValueOnce(expectedCuration)

            updateSpy = jest
              .spyOn(service, 'updateById')
              .mockResolvedValueOnce(expectedCuration)
          })

          it('should resolve with the updated curation', async () => {
            await expect(
              router.updateCollectionCuration(req)
            ).resolves.toStrictEqual(expectedCuration)
          })

          it('should call the update method with the right data', async () => {
            await router.updateCollectionCuration(req)

            expect(updateSpy).toHaveBeenCalledWith('curationId', {
              assignee: assignee.toLowerCase(),
              updated_at: expect.any(Date),
            })
          })
        })
        describe('and it updates both the status & assignee', () => {
          let assignee: string
          beforeEach(() => {
            assignee = mockAddress
            req = {
              auth: { ethAddress: 'ethAddress' },
              params: { id: 'some id' },
              body: {
                curation: { status: CurationStatus.REJECTED, assignee },
              },
            } as any
            service = mockServiceWithAccess(CollectionCuration, true)
            expectedCuration = {
              id: 'uuid-123123-123123',
            } as CollectionCurationAttributes

            jest
              .spyOn(service, 'getLatestById')
              .mockResolvedValueOnce({ id: 'curationId' } as any)

            jest
              .spyOn(service, 'updateById')
              .mockResolvedValueOnce(expectedCuration)

            updateSpy = jest
              .spyOn(service, 'updateById')
              .mockResolvedValueOnce(expectedCuration)
          })

          it('should resolve with the updated curation', async () => {
            await expect(
              router.updateCollectionCuration(req)
            ).resolves.toStrictEqual(expectedCuration)
          })

          it('should call the update method with the right data', async () => {
            await router.updateCollectionCuration(req)

            expect(updateSpy).toHaveBeenCalledWith('curationId', {
              status: CurationStatus.REJECTED,
              assignee: assignee.toLowerCase(),
              updated_at: expect.any(Date),
            })
          })
        })
      })

      describe('when updating an item curation', () => {
        let itemUpdateSpy: jest.SpyInstance<Promise<ItemAttributes>>
        let collectionUpdateSpy: jest.SpyInstance<Promise<{ rowCount: number }>>
        let expectedCuration: ItemCurationAttributes

        beforeEach(() => {
          req = {
            auth: { ethAddress: 'ethAddress' },
            params: { id: 'some id' },
            body: {
              curation: {
                status: CurationStatus.REJECTED,
              },
            },
          } as any
          service = mockServiceWithAccess(ItemCuration, true)
          expectedCuration = {
            id: 'uuid-123123-123123',
          } as ItemCurationAttributes

          jest
            .spyOn(service, 'updateById')
            .mockResolvedValueOnce(expectedCuration)

          jest
            .spyOn(service, 'getLatestById')
            .mockResolvedValueOnce({ id: 'curationId' } as any)

          jest.spyOn(Item, 'findOne').mockResolvedValueOnce({
            id: 'itemId',
            local_content_hash: 'hash1',
          } as any)

          collectionUpdateSpy = jest
            .spyOn(CollectionCuration, 'updateByItemId')
            .mockResolvedValueOnce({ rowCount: 1 })

          itemUpdateSpy = jest
            .spyOn(service, 'updateById')
            .mockResolvedValueOnce(expectedCuration)
        })

        it('should resolve with the updated curation', async () => {
          await expect(router.updateItemCuration(req)).resolves.toStrictEqual(
            expectedCuration
          )
        })

        it('should call the update method with the right data', async () => {
          await router.updateItemCuration(req)

          expect(itemUpdateSpy).toHaveBeenCalledWith('curationId', {
            status: CurationStatus.REJECTED,
            content_hash: 'hash1',
            updated_at: expect.any(Date),
          })
        })

        it('should update the updated_at property of the collection curation', async () => {
          await router.updateItemCuration(req)

          expect(collectionUpdateSpy).toHaveBeenCalledWith(req.params.id)
        })
      })
    })
  })

  describe('when trying to insert a new curation', () => {
    let service: CurationService<any>

    describe('when the caller has no access', () => {
      let req: AuthRequest

      beforeEach(() => {
        req = {
          auth: { ethAddress: 'ethAddress' },
          params: { id: 'some id' },
        } as any
      })

      describe('when inserting a collection curation', () => {
        beforeEach(() => {
          service = mockServiceWithAccess(CollectionCuration, false)

          jest
            .spyOn(Collection, 'findOne')
            .mockResolvedValueOnce({ ...dbCollectionMock })
          jest
            .spyOn(collectionAPI, 'fetchCollection')
            .mockResolvedValueOnce({ ...collectionFragmentMock })
        })

        it('should reject with an unauthorized message', async () => {
          await expect(
            router.insertCollectionCuration(req)
          ).rejects.toThrowError('Unauthorized')
        })
      })

      describe('when inserting an item curation', () => {
        beforeEach(() => {
          service = mockServiceWithAccess(ItemCuration, false)
        })

        it('should reject with an unauthorized message', async () => {
          await expect(router.insertItemCuration(req)).rejects.toThrowError(
            'Unauthorized'
          )
        })
      })
    })

    describe('when the collection does not exist', () => {
      let req: AuthRequest

      beforeEach(() => {
        jest.spyOn(Collection, 'findOne').mockResolvedValueOnce(undefined)

        req = {
          auth: { ethAddress: 'ethAddress' },
          params: { id: 'collectionId' },
        } as any
      })

      it('should reject with a not found message', async () => {
        await expect(router.insertCollectionCuration(req)).rejects.toThrowError(
          'Not found'
        )
      })
    })

    describe('when the collection is not published', () => {
      let req: AuthRequest

      beforeEach(() => {
        jest
          .spyOn(Collection, 'findOne')
          .mockResolvedValueOnce({ ...dbCollectionMock })

        jest.spyOn(collectionAPI, 'fetchCollection').mockResolvedValueOnce(null)

        req = {
          auth: { ethAddress: 'ethAddress' },
          params: { id: 'collectionId' },
        } as any
      })

      it('should reject with a unpublished collection message', async () => {
        await expect(router.insertCollectionCuration(req)).rejects.toThrowError(
          'Unpublished collection'
        )
      })
    })

    describe('when the resource has a pending review', () => {
      let req: AuthRequest

      beforeEach(() => {
        jest
          .spyOn(Collection, 'findOne')
          .mockResolvedValueOnce({ ...dbCollectionMock })
        jest
          .spyOn(collectionAPI, 'fetchCollection')
          .mockResolvedValueOnce({ ...collectionFragmentMock })

        req = {
          auth: { ethAddress: 'ethAddress' },
          params: { id: 'some id' },
        } as any
      })

      describe("and it's a collection curation", () => {
        beforeEach(() => {
          service = mockServiceWithAccess(CollectionCuration, true)

          jest
            .spyOn(service, 'getLatestById')
            .mockResolvedValueOnce({ status: CurationStatus.PENDING } as any)
        })

        it('should reject with an ongoing review message', async () => {
          await expect(
            router.insertCollectionCuration(req)
          ).rejects.toThrowError('There is already an ongoing review request')
        })
      })

      describe("and it's an item curation", () => {
        beforeEach(() => {
          service = mockServiceWithAccess(ItemCuration, true)

          jest
            .spyOn(service, 'getLatestById')
            .mockResolvedValueOnce({ status: CurationStatus.PENDING } as any)
        })

        it('should reject with an ongoing review message', async () => {
          await expect(router.insertItemCuration(req)).rejects.toThrowError(
            'There is already an ongoing review request'
          )
        })
      })
    })

    describe("when the item doesn't have a previous finished curation", () => {
      let req: AuthRequest

      beforeEach(() => {
        service = mockServiceWithAccess(ItemCuration, true)

        req = {
          auth: { ethAddress: 'ethAddress' },
          params: { id: 'some id' },
        } as any

        jest.spyOn(service, 'getLatestById').mockResolvedValueOnce(undefined)
      })

      it('should reject with an ongoing review message', async () => {
        await expect(router.insertItemCuration(req)).rejects.toThrowError(
          "Item curations can't be created for items that weren't curated before"
        )
      })
    })

    describe('when everything is fine', () => {
      let assignee: string
      let req: AuthRequest

      beforeEach(() => {
        assignee = mockAddress
        jest
          .spyOn(Collection, 'findOne')
          .mockResolvedValueOnce({ ...dbCollectionMock })
        jest
          .spyOn(collectionAPI, 'fetchCollection')
          .mockResolvedValueOnce({ ...collectionFragmentMock })

        req = {
          auth: { ethAddress: 'ethAddress' },
          params: { id: 'some id' },
          body: {
            curation: {
              assignee,
            },
          },
        } as any
      })

      describe('when updating a collection curation', () => {
        let expectedCuration: CollectionCurationAttributes

        beforeEach(() => {
          expectedCuration = {
            id: 'uuid-123123-123123',
          } as CollectionCurationAttributes

          service = mockServiceWithAccess(CollectionCuration, true)
          jest.spyOn(service, 'getLatestById').mockResolvedValueOnce(undefined)
        })

        it('should resolve with the inserted curation', async () => {
          const createSpy = jest
            .spyOn(CollectionCuration, 'create')
            .mockResolvedValueOnce(expectedCuration)

          expect(await router.insertCollectionCuration(req)).toEqual(
            expectedCuration
          )

          expect(createSpy).toHaveBeenCalledWith({
            id: expect.any(String),
            collection_id: 'some id',
            status: CurationStatus.PENDING,
            created_at: expect.any(Date),
            updated_at: expect.any(Date),
            assignee: assignee.toLowerCase(),
          })
        })
      })

      describe('when updating an item', () => {
        let item: ItemAttributes
        let createItemCurationSpy: jest.SpyInstance

        beforeEach(() => {
          item = { ...dbItemMock, local_content_hash: 'hash1' }
          service = mockServiceWithAccess(ItemCuration, true)

          jest
            .spyOn(service, 'getLatestById')
            .mockResolvedValueOnce({ status: CurationStatus.APPROVED } as any)
          jest.spyOn(Item, 'findOne').mockResolvedValueOnce(item)

          createItemCurationSpy = jest
            .spyOn(ItemCuration, 'create')
            .mockResolvedValueOnce({} as any)
        })

        it('should resolve with the inserted curation', async () => {
          expect(await router.insertItemCuration(req)).toEqual({})

          expect(createItemCurationSpy).toHaveBeenCalledWith({
            id: expect.any(String),
            item_id: 'some id',
            status: CurationStatus.PENDING,
            created_at: expect.any(Date),
            updated_at: expect.any(Date),
            content_hash: item.local_content_hash,
          })
        })
      })
    })
  })

  describe('when trying to insert a new forum post notifying a new curation assignee', () => {
    describe('and when the caller is not a committee member', () => {
      let req: AuthRequest

      beforeEach(() => {
        req = {
          auth: { ethAddress: 'ethAddress' },
          params: { id: 'some id' },
        } as any
        mockIsCommitteeMember.mockResolvedValueOnce(false)
      })

      it('should reject with an unauthorized message', async () => {
        await expect(
          router.createCurationNewAssigneePost(req)
        ).rejects.toThrowError('Unauthorized')
      })
    })

    describe('and when the caller is a committee member', () => {
      let req: AuthRequest
      let forumPost: ForumNewPost

      beforeEach(() => {
        mockCreateAssigneeEventPost.mockResolvedValue({})
        forumPost = { raw: '', topic_id: '1' }
        req = {
          auth: { ethAddress: 'ethAddress' },
          params: { id: 'some id', forumPost },
        } as any
        mockIsCommitteeMember.mockResolvedValueOnce(true)
      })

      it('should call the forum api with the forum post received', async () => {
        await expect(
          router.createCurationNewAssigneePost(req)
        ).resolves.not.toThrow()
        expect(createAssigneeEventPost).toHaveBeenCalledWith(forumPost)
      })
    })
  })
})
