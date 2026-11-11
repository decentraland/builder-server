import { ExpressApp } from '../common/ExpressApp'
import {
  collectionFragmentMock,
  dbCollectionMock,
} from '../../spec/mocks/collections'
import { itemCurationMock } from '../../spec/mocks/itemCuration'
import { dbItemMock } from '../../spec/mocks/items'
import { collectionAPI } from '../ethereum/api/collection'
import { Collection } from '../Collection'
import { Item, ItemAttributes } from '../Item'
import { isCommitteeMember } from '../Committee'
import { ThirdPartyService } from '../ThirdParty/ThirdParty.service'
import { AuthRequest } from '../middleware'
import { CurationRouter } from './Curation.router'
import {
  CollectionCuration,
  CollectionCurationAttributes,
} from './CollectionCuration'
import { ItemCuration, ItemCurationAttributes } from './ItemCuration'
import { CurationService } from './Curation.service'
import { CurationStatus } from './Curation.types'
import { createAssigneeEventPost, getPost } from '../Forum'
import { curationNotifications } from './notifications'
import { AutoCurationService } from './AutoCuration.service'
import {
  CollectionBusyError,
  ValidationInProgressError,
  ValidationLimitReachedError,
} from './AutoCuration.errors'
import { withCollectionLock } from './collectionLock'
import { STATUS_CODES } from '../common/HTTPError'
import { VIDEO_PATH } from '../Item/utils'
import { ItemService } from '../Item/Item.service'
import { isFeatureFlagEnabled } from '../utils/features'
import {
  CollectionEvent,
  CollectionEventActor,
  CollectionEventType,
} from './CollectionEvent'

jest.mock('../common/Router')
jest.mock('../common/ExpressApp')
jest.mock('../Committee')
jest.mock('../Curation/ItemCuration')
jest.mock('../Forum')
jest.mock('../utils/features')
jest.mock('./CollectionEvent/CollectionEvent.model')
jest.mock('./notifications')
jest.mock('./AutoCuration.service')
jest.mock('./collectionLock', () => ({
  withCollectionLock: jest.fn((_: string, task: () => Promise<unknown>) =>
    task()
  ),
}))

const mockIsCommitteeMember = isCommitteeMember as jest.Mock
const mockCreateAssigneeEventPost = createAssigneeEventPost as jest.Mock
const mockIsFeatureFlagEnabled = isFeatureFlagEnabled as jest.Mock
const mockRecordEvent = CollectionEvent.record as jest.Mock
const mockGetPost = getPost as jest.Mock

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

  const submittedChanges = { collection: {}, items: [{ id: 'changed' }] }

  beforeEach(() => {
    router = new CurationRouter(new ExpressApp())
    ;(AutoCurationService.prototype
      .prepareChanges as jest.Mock).mockResolvedValue(submittedChanges)
  })

  afterEach(() => {
    jest.restoreAllMocks()
    jest.clearAllMocks()
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
          .spyOn(ThirdPartyService, 'getThirdParties')
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

        it('should reject with an unauthorized message without touching the collection curation', async () => {
          await expect(router.updateItemCuration(req)).rejects.toThrowError(
            'Unauthorized'
          )
          expect(CollectionCuration.updateByItemId).not.toHaveBeenCalled()
        })
      })
    })

    describe('when passing a new assignee and the caller is not a committee member', () => {
      let req: AuthRequest

      beforeEach(() => {
        req = {
          auth: { ethAddress: 'ethAddress' },
          params: {
            id: 'some id',
          },
          body: {
            curation: {
              assignee: '0xnotCommitteeMember',
              status: CurationStatus.PENDING,
            },
          },
        } as any
      })

      describe('when updating a collection curation', () => {
        beforeEach(() => {
          service = mockServiceWithAccess(CollectionCuration, true)
          mockIsCommitteeMember.mockResolvedValueOnce(false) // the first call checks if the caller is a committee member
          jest
            .spyOn(service, 'getLatestById')
            .mockResolvedValueOnce({ id: 'curationId' } as any)
        })

        it('should reject with an error message saying the assignee is not a committee member', async () => {
          await expect(
            router.updateCollectionCuration(req)
          ).rejects.toThrowError(
            'Only committee members can modify the assignee'
          )
        })
      })
    })

    describe('when a committee member changes the assignee', () => {
      let req: AuthRequest
      let assignee: string | null

      beforeEach(() => {
        service = mockServiceWithAccess(CollectionCuration, true)
        mockIsCommitteeMember.mockResolvedValue(true)
        jest
          .spyOn(service, 'updateById')
          .mockResolvedValueOnce({ id: 'curationId' } as any)
      })

      describe('and the curation was assigned to someone else', () => {
        beforeEach(() => {
          assignee = '0xAnotherCurator'
          jest.spyOn(service, 'getLatestById').mockResolvedValueOnce({
            id: 'curationId',
            assignee: '0xcurator',
          } as any)
          req = {
            auth: { ethAddress: 'ethAddress' },
            params: { id: 'some id' },
            body: { curation: { assignee } },
          } as any
        })

        it('should notify the curators about the new assignee', async () => {
          await router.updateCollectionCuration(req)

          expect(curationNotifications.assigneeChanged).toHaveBeenCalledWith(
            'some id',
            '0xanothercurator',
            'ethAddress'
          )
        })
      })

      describe('and the curation is unassigned', () => {
        beforeEach(() => {
          jest.spyOn(service, 'getLatestById').mockResolvedValueOnce({
            id: 'curationId',
            assignee: '0xcurator',
          } as any)
          req = {
            auth: { ethAddress: 'ethAddress' },
            params: { id: 'some id' },
            body: { curation: { assignee: null } },
          } as any
        })

        it('should notify the curators about the unassignment', async () => {
          await router.updateCollectionCuration(req)

          expect(curationNotifications.assigneeChanged).toHaveBeenCalledWith(
            'some id',
            null,
            'ethAddress'
          )
        })
      })

      describe('and an empty assignee is sent while already unassigned', () => {
        beforeEach(() => {
          jest.spyOn(service, 'getLatestById').mockResolvedValueOnce({
            id: 'curationId',
            assignee: null,
          } as any)
          req = {
            auth: { ethAddress: 'ethAddress' },
            params: { id: 'some id' },
            body: { curation: { assignee: '' } },
          } as any
        })

        it('should not notify the curators', async () => {
          await router.updateCollectionCuration(req)

          expect(curationNotifications.assigneeChanged).not.toHaveBeenCalled()
        })
      })

      describe('and the assignee does not change', () => {
        beforeEach(() => {
          jest.spyOn(service, 'getLatestById').mockResolvedValueOnce({
            id: 'curationId',
            assignee: '0xcurator',
          } as any)
          req = {
            auth: { ethAddress: 'ethAddress' },
            params: { id: 'some id' },
            body: { curation: { assignee: '0xCurator' } },
          } as any
        })

        it('should not notify the curators', async () => {
          await router.updateCollectionCuration(req)

          expect(curationNotifications.assigneeChanged).not.toHaveBeenCalled()
        })
      })
    })

    describe.each([null, ''])(
      'when unassigning a curation with %p and the caller is not a committee member',
      (assignee) => {
        let req: AuthRequest

        beforeEach(() => {
          service = mockServiceWithAccess(CollectionCuration, true)
          mockIsCommitteeMember.mockResolvedValueOnce(false)
          jest.spyOn(service, 'getLatestById').mockResolvedValueOnce({
            id: 'curationId',
            assignee: '0xcurator',
          } as any)
          req = {
            auth: { ethAddress: 'ethAddress' },
            params: { id: 'some id' },
            body: { curation: { assignee } },
          } as any
        })

        it('should reject with an error message saying only committee members can modify the assignee', async () => {
          await expect(
            router.updateCollectionCuration(req)
          ).rejects.toThrowError(
            'Only committee members can modify the assignee'
          )
          expect(curationNotifications.assigneeChanged).not.toHaveBeenCalled()
        })
      }
    )

    describe('when the new assignee is not a committee member', () => {
      let req: AuthRequest

      beforeEach(() => {
        req = {
          auth: { ethAddress: 'ethAddress' },
          params: {
            id: 'some id',
          },
          body: {
            curation: {
              assignee: '0xnotCommitteeMember',
              status: CurationStatus.PENDING,
            },
          },
        } as any
      })

      describe('when updating a collection curation', () => {
        beforeEach(() => {
          service = mockServiceWithAccess(CollectionCuration, true)
          mockIsCommitteeMember.mockResolvedValueOnce(true) // the first call checks if the caller is a committee member
          jest
            .spyOn(service, 'getLatestById')
            .mockResolvedValueOnce({ id: 'curationId' } as any)
        })

        it('should reject with an error message saying the assignee is not a committee member', async () => {
          await expect(
            router.updateCollectionCuration(req)
          ).rejects.toThrowError('The assignee must be a committee member')
        })
      })
    })

    describe('when setting the status to approved/rejected and the caller is not a committee member', () => {
      let req: AuthRequest

      beforeEach(() => {
        req = {
          auth: { ethAddress: 'ethAddress' },
          params: { id: 'some id' },
          body: { curation: { status: CurationStatus.APPROVED } },
        } as any
      })

      describe('when updating a collection curation', () => {
        let updateSpy: jest.SpyInstance
        beforeEach(() => {
          service = mockServiceWithAccess(CollectionCuration, true)
          mockIsCommitteeMember.mockResolvedValueOnce(false)
          jest
            .spyOn(service, 'getLatestById')
            .mockResolvedValueOnce({ id: 'curationId' } as any)
          updateSpy = jest.spyOn(service, 'updateById')
        })

        it('should reject with an unauthorized message and not update the curation', async () => {
          await expect(
            router.updateCollectionCuration(req)
          ).rejects.toThrowError(
            'Only committee members can approve or reject a curation'
          )
          expect(updateSpy).not.toHaveBeenCalled()
        })
      })

      describe('when updating an item curation', () => {
        let updateSpy: jest.SpyInstance
        beforeEach(() => {
          service = mockServiceWithAccess(ItemCuration, true)
          mockIsCommitteeMember.mockResolvedValueOnce(false)
          jest
            .spyOn(CollectionCuration, 'updateByItemId')
            .mockResolvedValueOnce({ rowCount: 1 })
          jest
            .spyOn(service, 'getLatestById')
            .mockResolvedValueOnce({ id: 'curationId' } as any)
          updateSpy = jest.spyOn(service, 'updateById')
        })

        it('should reject with an unauthorized message and not update the curation nor touch the collection curation', async () => {
          await expect(router.updateItemCuration(req)).rejects.toThrowError(
            'Only committee members can approve or reject a curation'
          )
          expect(updateSpy).not.toHaveBeenCalled()
          expect(CollectionCuration.updateByItemId).not.toHaveBeenCalled()
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
        mockIsCommitteeMember.mockResolvedValueOnce(true)
        jest
          .spyOn(service, 'getLatestById')
          .mockResolvedValueOnce({ id: 'curationId' } as any)

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
        mockIsCommitteeMember.mockResolvedValue(true)
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
            mockIsCommitteeMember.mockResolvedValueOnce(true)
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
              reviewed_by: 'ethaddress',
            })
          })

          it('should record a review.rejected event without reasons', async () => {
            await router.updateCollectionCuration(req)

            expect(mockRecordEvent).toHaveBeenCalledWith({
              collection_id: 'some id',
              actor: CollectionEventActor.CURATOR,
              actor_address: 'ethaddress',
              type: CollectionEventType.REVIEW_REJECTED,
              payload: { rejectionReasons: [], rejectionMessage: null },
            })
          })

          it('should notify the curators about the verdict', async () => {
            await router.updateCollectionCuration(req)

            expect(curationNotifications.verdictGiven).toHaveBeenCalledWith(
              'some id',
              CurationStatus.REJECTED,
              'ethAddress'
            )
          })

          describe('and the curation already had that status', () => {
            beforeEach(() => {
              jest.restoreAllMocks()
              service = mockServiceWithAccess(CollectionCuration, true)
              mockIsCommitteeMember.mockResolvedValueOnce(true)
              jest.spyOn(service, 'getLatestById').mockResolvedValueOnce({
                id: 'curationId',
                status: CurationStatus.REJECTED,
                created_at: new Date('2026-11-10T10:00:00.000Z'),
              } as any)
              jest
                .spyOn(service, 'updateById')
                .mockResolvedValueOnce(expectedCuration)
              ;(CollectionEvent.findLatestByCollectionIdAndTypes as jest.Mock).mockResolvedValue(
                {
                  type: CollectionEventType.REVIEW_REJECTED,
                  created_at: new Date('2026-11-10T11:00:00.000Z'),
                }
              )
            })

            it('should not notify the curators again', async () => {
              await router.updateCollectionCuration(req)

              expect(curationNotifications.verdictGiven).not.toHaveBeenCalled()
            })
          })

          describe('and the collection contains an smart wearable', () => {
            let mockItem: ItemAttributes
            let mockItemsWithCount: ItemAttributes & { total_count: number }
            let updateItemSpy: jest.SpyInstance<
              ReturnType<typeof Item['upsert']>
            >

            beforeEach(() => {
              mockItem = {
                ...dbItemMock,
                contents: {
                  ...dbItemMock.contents,
                  'male/game.js': 'hash1',
                  [VIDEO_PATH]: 'videoHash',
                },
                video: 'videoHash',
              }

              mockItemsWithCount = {
                ...mockItem,
                total_count: 1,
              }

              expectedCuration = {
                ...expectedCuration,
                status: CurationStatus.APPROVED,
              }

              req = {
                ...req,
                body: {
                  curation: {
                    status: CurationStatus.APPROVED,
                  },
                },
              } as any

              updateSpy = jest
                .spyOn(service, 'updateById')
                .mockResolvedValueOnce(expectedCuration)
              jest
                .spyOn(Item, 'findByCollectionId')
                .mockResolvedValueOnce([mockItemsWithCount])
              updateItemSpy = jest
                .spyOn(Item, 'upsert')
                .mockResolvedValueOnce(mockItem)
            })

            describe('and the smart wearable has updated the video', () => {
              const newVideoHash = 'newVideoHash'

              beforeEach(() => {
                mockItemsWithCount.contents = {
                  ...mockItemsWithCount.contents,
                  [VIDEO_PATH]: newVideoHash,
                }

                mockItem.contents = {
                  ...mockItem.contents,
                  [VIDEO_PATH]: newVideoHash,
                }
                mockItem.video = newVideoHash
              })

              it('should resolved with the inserted curation and update the item video', async () => {
                await router.updateCollectionCuration(req)
                expect(updateSpy).toHaveBeenCalledWith('curationId', {
                  status: CurationStatus.APPROVED,
                  updated_at: expect.any(Date),
                  reviewed_by: 'ethaddress',
                  rejection_reasons: null,
                  rejection_message: null,
                })
                expect(updateItemSpy).toHaveBeenCalledWith(mockItem)
              })
            })

            describe('and the smart wearable has not updated the video', () => {
              it('should resolved with the inserted curation and not update the item video', async () => {
                await router.updateCollectionCuration(req)
                expect(updateSpy).toHaveBeenCalledWith('curationId', {
                  status: CurationStatus.APPROVED,
                  updated_at: expect.any(Date),
                  reviewed_by: 'ethaddress',
                  rejection_reasons: null,
                  rejection_message: null,
                })
                expect(updateItemSpy).not.toHaveBeenCalled()
              })
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

          describe('and the assignee is not a committee member', () => {
            beforeEach(() => {
              mockIsCommitteeMember
                .mockResolvedValueOnce(true)
                .mockResolvedValueOnce(false)
            })
            it('should throw an error saying the assignee is not a committee member', async () => {
              await expect(
                router.insertCollectionCuration(req)
              ).rejects.toThrowError('The assignee must be a committee member')
            })
          })

          describe('and the caller is not a committee member', () => {
            beforeEach(() => {
              mockIsCommitteeMember.mockResolvedValueOnce(false)
            })
            it('should reject and not create a curation with the assignee', async () => {
              const createSpy = jest.spyOn(CollectionCuration, 'create')
              await expect(
                router.insertCollectionCuration(req)
              ).rejects.toThrowError(
                'Only committee members can modify the assignee'
              )
              expect(createSpy).not.toHaveBeenCalled()
            })
          })

          describe('and the caller and the assignee are committee members', () => {
            beforeEach(() => {
              mockIsCommitteeMember.mockResolvedValue(true)
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

            it('should record a review.assigned event', async () => {
              await router.updateCollectionCuration(req)

              expect(mockRecordEvent).toHaveBeenCalledWith({
                collection_id: 'some id',
                actor: CollectionEventActor.CURATOR,
                actor_address: 'ethaddress',
                type: CollectionEventType.REVIEW_ASSIGNED,
                payload: { assignee: assignee.toLowerCase() },
              })
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

            mockIsCommitteeMember
              .mockResolvedValueOnce(true)
              .mockResolvedValueOnce(true)
              .mockResolvedValueOnce(true)

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
              reviewed_by: 'ethaddress',
            })
          })

          it('should record the assignment and the rejection as events', async () => {
            await router.updateCollectionCuration(req)

            expect(mockRecordEvent).toHaveBeenCalledWith(
              expect.objectContaining({
                type: CollectionEventType.REVIEW_ASSIGNED,
                payload: { assignee: assignee.toLowerCase() },
              })
            )
            expect(mockRecordEvent).toHaveBeenCalledWith(
              expect.objectContaining({
                type: CollectionEventType.REVIEW_REJECTED,
              })
            )
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
          mockIsCommitteeMember.mockResolvedValueOnce(true)
          expectedCuration = {
            id: 'uuid-123123-123123',
          } as ItemCurationAttributes

          jest
            .spyOn(service, 'updateById')
            .mockResolvedValueOnce(expectedCuration)

          jest
            .spyOn(service, 'getLatestById')
            .mockResolvedValueOnce({ id: 'curationId' } as any)

          collectionUpdateSpy = jest
            .spyOn(CollectionCuration, 'updateByItemId')
            .mockResolvedValueOnce({ rowCount: 1 })

          itemUpdateSpy = jest
            .spyOn(service, 'updateById')
            .mockResolvedValueOnce(expectedCuration)
        })

        describe('and the item has mappings', () => {
          beforeEach(() => {
            jest.spyOn(Item, 'findOne').mockResolvedValueOnce({
              id: 'itemId',
              local_content_hash: 'hash1',
              mappings: { type: 'any' },
            } as any)
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
              is_mapping_complete: true,
            })
          })

          it('should update the updated_at property of the collection curation', async () => {
            await router.updateItemCuration(req)

            expect(collectionUpdateSpy).toHaveBeenCalledWith(req.params.id)
          })
        })

        describe('and the item does not have mappings', () => {
          beforeEach(() => {
            jest.spyOn(Item, 'findOne').mockResolvedValueOnce({
              id: 'itemId',
              local_content_hash: 'hash1',
              mappings: null,
            } as any)
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
              is_mapping_complete: false,
            })
          })

          it('should update the updated_at property of the collection curation', async () => {
            await router.updateItemCuration(req)

            expect(collectionUpdateSpy).toHaveBeenCalledWith(req.params.id)
          })
        })
      })
    })

    describe('and a non-committee owner sets the status of an item curation to pending', () => {
      let req: AuthRequest
      let collectionUpdateSpy: jest.SpyInstance
      let itemUpdateSpy: jest.SpyInstance

      beforeEach(() => {
        req = {
          auth: { ethAddress: 'ethAddress' },
          params: { id: 'some id' },
          body: { curation: { status: CurationStatus.PENDING } },
        } as any
        service = mockServiceWithAccess(ItemCuration, true)
        mockIsCommitteeMember.mockResolvedValue(false)
        jest
          .spyOn(service, 'getLatestById')
          .mockResolvedValueOnce({ id: 'curationId' } as any)
        collectionUpdateSpy = jest
          .spyOn(CollectionCuration, 'updateByItemId')
          .mockResolvedValueOnce({ rowCount: 1 })
        itemUpdateSpy = jest
          .spyOn(service, 'updateById')
          .mockResolvedValueOnce({ id: 'curationId' } as any)
        jest.spyOn(Item, 'findOne').mockResolvedValueOnce({
          id: 'itemId',
          local_content_hash: 'hash1',
          mappings: null,
        } as any)
      })

      it('should touch the collection curation and update the item curation without a committee check', async () => {
        await router.updateItemCuration(req)

        expect(collectionUpdateSpy).toHaveBeenCalledWith('some id')
        expect(itemUpdateSpy).toHaveBeenCalled()
        expect(mockIsCommitteeMember).not.toHaveBeenCalled()
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
          mockIsCommitteeMember
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce(true)
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

        it('should notify the curators about the assignment', async () => {
          jest
            .spyOn(CollectionCuration, 'create')
            .mockResolvedValueOnce(expectedCuration)

          await router.insertCollectionCuration(req)

          expect(curationNotifications.assigneeChanged).toHaveBeenCalledWith(
            'some id',
            assignee.toLowerCase(),
            'ethAddress'
          )
          expect(curationNotifications.reviewRequested).not.toHaveBeenCalled()
        })

        it('should not request the automatic review', async () => {
          jest
            .spyOn(CollectionCuration, 'create')
            .mockResolvedValueOnce(expectedCuration)

          await router.insertCollectionCuration(req)

          expect(
            AutoCurationService.prototype.onChangesSubmitted
          ).not.toHaveBeenCalled()
        })
      })

      describe('when a creator opens a review request', () => {
        let expectedCuration: CollectionCurationAttributes

        beforeEach(() => {
          expectedCuration = {
            id: 'uuid-123123-123123',
          } as CollectionCurationAttributes
          req = {
            auth: { ethAddress: 'ethAddress' },
            params: { id: 'some id' },
          } as any

          service = mockServiceWithAccess(CollectionCuration, true)
          jest
            .spyOn(service, 'getLatestById')
            .mockResolvedValueOnce({ status: CurationStatus.REJECTED } as any)
          jest
            .spyOn(CollectionCuration, 'create')
            .mockResolvedValueOnce(expectedCuration)
        })

        it('should notify the curators and request the automatic review of the changes', async () => {
          expect(await router.insertCollectionCuration(req)).toEqual(
            expectedCuration
          )

          expect(curationNotifications.reviewRequested).toHaveBeenCalledWith(
            'some id',
            CurationStatus.REJECTED,
            'ethAddress'
          )
          expect(
            AutoCurationService.prototype.onChangesSubmitted
          ).toHaveBeenCalledWith(submittedChanges, 'ethAddress')
        })
      })

      describe('when a creator opens the first review request of a collection', () => {
        let expectedCuration: CollectionCurationAttributes

        beforeEach(() => {
          expectedCuration = {
            id: 'uuid-123123-123123',
          } as CollectionCurationAttributes
          req = {
            auth: { ethAddress: 'ethAddress' },
            params: { id: 'some id' },
          } as any

          service = mockServiceWithAccess(CollectionCuration, true)
          jest.spyOn(service, 'getLatestById').mockResolvedValueOnce(undefined)
          jest
            .spyOn(CollectionCuration, 'create')
            .mockResolvedValueOnce(expectedCuration)
        })

        describe('and the chain never approved the collection', () => {
          beforeEach(() => {
            jest
              .spyOn(collectionAPI, 'fetchCollection')
              .mockReset()
              .mockResolvedValueOnce({
                ...collectionFragmentMock,
                isApproved: false,
              })
          })

          it('should insert the request without announcing it or requesting an automatic review', async () => {
            expect(await router.insertCollectionCuration(req)).toEqual(
              expectedCuration
            )

            expect(curationNotifications.reviewRequested).not.toHaveBeenCalled()
            expect(
              AutoCurationService.prototype.onChangesSubmitted
            ).not.toHaveBeenCalled()
          })
        })

        describe('and the publication was recorded as an event', () => {
          beforeEach(() => {
            ;(CollectionEvent.findLatestByCollectionIdAndType as jest.Mock).mockResolvedValueOnce(
              { type: CollectionEventType.COLLECTION_PUBLISHED }
            )
            jest.spyOn(collectionAPI, 'fetchCollection').mockReset()
          })

          it('should treat it as the first request without asking the graph', async () => {
            expect(await router.insertCollectionCuration(req)).toEqual(
              expectedCuration
            )

            expect(collectionAPI.fetchCollection).not.toHaveBeenCalled()
            expect(curationNotifications.reviewRequested).not.toHaveBeenCalled()
            expect(
              AutoCurationService.prototype.onChangesSubmitted
            ).not.toHaveBeenCalled()
          })
        })

        describe('and the graph is down', () => {
          beforeEach(() => {
            jest
              .spyOn(collectionAPI, 'fetchCollection')
              .mockReset()
              .mockRejectedValueOnce(new Error('subgraph down'))
          })

          it('should treat it as submitted changes, announcing them and requesting their automatic review', async () => {
            expect(await router.insertCollectionCuration(req)).toEqual(
              expectedCuration
            )

            expect(curationNotifications.reviewRequested).toHaveBeenCalledWith(
              'some id',
              undefined,
              'ethAddress'
            )
            expect(
              AutoCurationService.prototype.onChangesSubmitted
            ).toHaveBeenCalledWith(submittedChanges, 'ethAddress')
          })
        })

        describe('and the graph answers without the collection', () => {
          beforeEach(() => {
            jest
              .spyOn(collectionAPI, 'fetchCollection')
              .mockReset()
              .mockResolvedValueOnce(undefined as any)
          })

          it('should treat it as submitted changes', async () => {
            await router.insertCollectionCuration(req)

            expect(curationNotifications.reviewRequested).toHaveBeenCalled()
            expect(
              AutoCurationService.prototype.onChangesSubmitted
            ).toHaveBeenCalledWith(submittedChanges, 'ethAddress')
          })
        })

        describe('and a committee member opens it on a collection they do not own', () => {
          beforeEach(() => {
            ;(Collection.findOne as jest.Mock).mockResolvedValue({
              ...dbCollectionMock,
              eth_address: '0xsomebodyelse',
            })
            mockIsCommitteeMember.mockReset().mockResolvedValue(true)
          })

          it('should insert the request as bookkeeping without announcing it or requesting a review', async () => {
            expect(await router.insertCollectionCuration(req)).toEqual(
              expectedCuration
            )

            expect(curationNotifications.reviewRequested).not.toHaveBeenCalled()
            expect(
              AutoCurationService.prototype.onChangesSubmitted
            ).not.toHaveBeenCalled()
          })
        })

        describe('and the collection was approved before requests were stored', () => {
          beforeEach(() => {
            jest
              .spyOn(collectionAPI, 'fetchCollection')
              .mockReset()
              .mockResolvedValueOnce({
                ...collectionFragmentMock,
                isApproved: true,
              })
          })

          it('should announce submitted changes and request their automatic review', async () => {
            expect(await router.insertCollectionCuration(req)).toEqual(
              expectedCuration
            )

            expect(curationNotifications.reviewRequested).toHaveBeenCalledWith(
              'some id',
              undefined,
              'ethAddress'
            )
            expect(
              AutoCurationService.prototype.onChangesSubmitted
            ).toHaveBeenCalledWith(submittedChanges, 'ethAddress')
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
            is_mapping_complete: false,
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
      let raw: string
      let collectionForumId: number
      let topicId: number

      beforeEach(() => {
        raw = 'The collection has been assigned'
        collectionForumId = 42
        topicId = 30
        mockCreateAssigneeEventPost.mockResolvedValue(undefined)
        mockGetPost.mockResolvedValue({ topic_id: topicId, raw: '' })
        jest.spyOn(Collection, 'findOne').mockResolvedValue({
          id: 'some id',
          forum_id: collectionForumId,
        } as any)
        req = {
          auth: { ethAddress: 'ethAddress' },
          params: { id: 'some id', forumPost: { raw, topic_id: '1' } },
        } as any
        mockIsCommitteeMember.mockResolvedValueOnce(true)
      })

      it('should resolve the topic from the collection forum post and ignore the client topic_id', async () => {
        await expect(
          router.createCurationNewAssigneePost(req)
        ).resolves.not.toThrow()
        expect(getPost).toHaveBeenCalledWith(collectionForumId)
        expect(createAssigneeEventPost).toHaveBeenCalledWith(topicId, raw)
      })

      describe('and the collection forum post has no topic', () => {
        beforeEach(() => {
          mockGetPost.mockResolvedValue({ topic_id: undefined, raw: '' })
        })

        it('should reject with a conflict message', async () => {
          await expect(
            router.createCurationNewAssigneePost(req)
          ).rejects.toThrow('The collection forum post has no topic')
        })
      })

      describe('and the collection has no forum post yet', () => {
        beforeEach(() => {
          jest.spyOn(Collection, 'findOne').mockResolvedValue({
            id: 'some id',
            forum_id: null,
          } as any)
        })

        it('should reject with a conflict message', async () => {
          await expect(
            router.createCurationNewAssigneePost(req)
          ).rejects.toThrow('The collection does not have a forum post yet')
        })
      })

      describe('and the forum post has no raw content', () => {
        beforeEach(() => {
          req = {
            auth: { ethAddress: 'ethAddress' },
            params: { id: 'some id', forumPost: { raw: '' } },
          } as any
        })

        it('should reject with an invalid forum post message', async () => {
          await expect(
            router.createCurationNewAssigneePost(req)
          ).rejects.toThrow('Invalid forum post')
        })
      })

      describe('and the forum post content exceeds the maximum length', () => {
        beforeEach(() => {
          req = {
            auth: { ethAddress: 'ethAddress' },
            params: { id: 'some id', forumPost: { raw: 'a'.repeat(10001) } },
          } as any
        })

        it('should reject with an invalid forum post message', async () => {
          await expect(
            router.createCurationNewAssigneePost(req)
          ).rejects.toThrow('Invalid forum post')
        })
      })

      describe('and the collection does not exist', () => {
        beforeEach(() => {
          jest.spyOn(Collection, 'findOne').mockResolvedValue(undefined)
        })

        it('should reject with a not found message', async () => {
          await expect(
            router.createCurationNewAssigneePost(req)
          ).rejects.toThrow('Collection not found')
        })
      })

      describe('and the forum rejects the assignee post', () => {
        beforeEach(() => {
          mockCreateAssigneeEventPost.mockRejectedValueOnce(
            new Error(
              'Error creating the assignee post for topic 30: Forbidden'
            )
          )
        })

        it('should reject with the forum error', async () => {
          await expect(
            router.createCurationNewAssigneePost(req)
          ).rejects.toThrow('Error creating the assignee post for topic 30')
        })
      })
    })
  })
  describe('when a creator tries to set the status of their own collection curation', () => {
    let req: AuthRequest
    let updateSpy: jest.SpyInstance

    beforeEach(() => {
      mockIsCommitteeMember.mockResolvedValue(false)
      const service = mockServiceWithAccess(CollectionCuration, true)
      jest
        .spyOn(service, 'getLatestById')
        .mockResolvedValueOnce({ id: 'curationId', status: 'rejected' } as any)
      updateSpy = jest.spyOn(service, 'updateById')
      req = {
        auth: { ethAddress: 'ethAddress' },
        params: { id: 'some id' },
        body: { curation: { status: CurationStatus.PENDING } },
      } as any
    })

    it('should refuse it: a review is reopened with a new request, never by flipping a decided one', async () => {
      await expect(router.updateCollectionCuration(req)).rejects.toThrowError(
        'Only committee members can approve or reject a curation'
      )
      expect(updateSpy).not.toHaveBeenCalled()
    })
  })

  describe('when a creator submits changes the automatic review cannot take now', () => {
    let req: AuthRequest
    let createSpy: jest.SpyInstance

    beforeEach(() => {
      const service = mockServiceWithAccess(CollectionCuration, true)
      jest
        .spyOn(service, 'getLatestById')
        .mockResolvedValueOnce({ status: CurationStatus.APPROVED } as any)
      createSpy = jest.spyOn(CollectionCuration, 'create')
      jest.spyOn(Collection, 'findOne').mockResolvedValue(dbCollectionMock)
      req = {
        auth: { ethAddress: dbCollectionMock.eth_address },
        params: { id: 'some id' },
      } as any
    })

    it('should answer 409 while a review runs, without storing the request', async () => {
      ;(AutoCurationService.prototype
        .prepareChanges as jest.Mock).mockRejectedValueOnce(
        new ValidationInProgressError('some id')
      )

      await expect(router.insertCollectionCuration(req)).rejects.toMatchObject({
        statusCode: STATUS_CODES.conflict,
      })
      expect(createSpy).not.toHaveBeenCalled()
    })

    it('should answer 429 with the time to retry past the daily limit, without storing the request', async () => {
      const retryAt = new Date('2026-11-12T00:00:00.000Z')
      ;(AutoCurationService.prototype
        .prepareChanges as jest.Mock).mockRejectedValueOnce(
        new ValidationLimitReachedError('some id', retryAt)
      )

      await expect(router.insertCollectionCuration(req)).rejects.toMatchObject({
        statusCode: STATUS_CODES.tooManyRequests,
        data: { id: 'some id', retryAt: retryAt.toISOString() },
      })
      expect(createSpy).not.toHaveBeenCalled()
    })
  })

  describe('when a committee member reviews a collection curation with the auto curation enabled', () => {
    let service: CurationService<any>
    let req: AuthRequest
    let updateSpy: jest.SpyInstance
    let expectedCuration: CollectionCurationAttributes

    beforeEach(() => {
      mockIsFeatureFlagEnabled.mockResolvedValue(true)
      mockIsCommitteeMember.mockResolvedValue(true)
      service = mockServiceWithAccess(CollectionCuration, true)
      expectedCuration = { id: 'curationId' } as CollectionCurationAttributes
      jest
        .spyOn(service, 'getLatestById')
        .mockResolvedValueOnce({ id: 'curationId' } as any)
      updateSpy = jest
        .spyOn(service, 'updateById')
        .mockResolvedValueOnce(expectedCuration)
    })

    describe('and the rejection message is longer than 2000 characters', () => {
      beforeEach(() => {
        req = {
          auth: { ethAddress: 'ethAddress' },
          params: { id: 'some id' },
          body: {
            curation: {
              status: CurationStatus.REJECTED,
              rejectionReasons: ['clipping'],
              rejectionMessage: 'a'.repeat(2001),
            },
          },
        } as any
      })

      it('should reject with an invalid schema error and not update the curation', async () => {
        await expect(router.updateCollectionCuration(req)).rejects.toThrowError(
          'Invalid schema'
        )
        expect(updateSpy).not.toHaveBeenCalled()
      })
    })

    describe('and a caller that is not a committee member unassigns the curation', () => {
      beforeEach(() => {
        mockIsCommitteeMember.mockReset().mockResolvedValue(false)
        req = {
          auth: { ethAddress: 'ethAddress' },
          params: { id: 'some id' },
          body: { curation: { assignee: null } },
        } as any
      })

      it('should reject and not record an assignment', async () => {
        await expect(router.updateCollectionCuration(req)).rejects.toThrowError(
          'Only committee members can modify the assignee'
        )
        expect(updateSpy).not.toHaveBeenCalled()
        expect(mockRecordEvent).not.toHaveBeenCalled()
      })
    })

    describe('and the curation is rejected with a reason outside the fixed list', () => {
      beforeEach(() => {
        req = {
          auth: { ethAddress: 'ethAddress' },
          params: { id: 'some id' },
          body: {
            curation: {
              status: CurationStatus.REJECTED,
              rejectionReasons: ['ugly'],
              rejectionMessage: 'Nope',
            },
          },
        } as any
      })

      it('should reject with an invalid schema message', async () => {
        await expect(router.updateCollectionCuration(req)).rejects.toThrowError(
          'Invalid schema'
        )
        expect(updateSpy).not.toHaveBeenCalled()
      })
    })

    describe('and the curation is rejected with reasons and a message', () => {
      beforeEach(() => {
        req = {
          auth: { ethAddress: 'ethAddress' },
          params: { id: 'some id' },
          body: {
            curation: {
              status: CurationStatus.REJECTED,
              rejectionReasons: ['clipping', 'other'],
              rejectionMessage: '  Clips through the body  ',
            },
          },
        } as any
      })

      it('should store the reviewer, the reasons and the trimmed message', async () => {
        await expect(
          router.updateCollectionCuration(req)
        ).resolves.toStrictEqual(expectedCuration)

        expect(updateSpy).toHaveBeenCalledWith('curationId', {
          status: CurationStatus.REJECTED,
          updated_at: expect.any(Date),
          reviewed_by: 'ethaddress',
          rejection_reasons: ['clipping', 'other'],
          rejection_message: 'Clips through the body',
        })
      })

      it('should record a review.rejected event with the reasons', async () => {
        await router.updateCollectionCuration(req)

        expect(mockRecordEvent).toHaveBeenCalledWith({
          collection_id: 'some id',
          actor: CollectionEventActor.CURATOR,
          actor_address: 'ethaddress',
          type: CollectionEventType.REVIEW_REJECTED,
          payload: {
            rejectionReasons: ['clipping', 'other'],
            rejectionMessage: 'Clips through the body',
          },
        })
      })
    })

    describe('and the curation is approved', () => {
      beforeEach(() => {
        jest
          .spyOn(ItemService.prototype, 'updateDCLItemsContent')
          .mockResolvedValueOnce(undefined as any)
        req = {
          auth: { ethAddress: 'ethAddress' },
          params: { id: 'some id' },
          body: { curation: { status: CurationStatus.APPROVED } },
        } as any
      })

      it('should store the reviewer, clear the rejection fields and record a review.approved event', async () => {
        await router.updateCollectionCuration(req)

        expect(updateSpy).toHaveBeenCalledWith('curationId', {
          status: CurationStatus.APPROVED,
          updated_at: expect.any(Date),
          reviewed_by: 'ethaddress',
          rejection_reasons: null,
          rejection_message: null,
        })
        expect(mockRecordEvent).toHaveBeenCalledWith({
          collection_id: 'some id',
          actor: CollectionEventActor.CURATOR,
          actor_address: 'ethaddress',
          type: CollectionEventType.REVIEW_APPROVED,
          payload: {},
        })
      })

      describe('and that decision was already recorded for this request', () => {
        beforeEach(() => {
          jest
            .spyOn(service, 'getLatestById')
            .mockReset()
            .mockResolvedValueOnce({
              id: 'curationId',
              status: CurationStatus.APPROVED,
              created_at: new Date('2026-11-10T10:00:00.000Z'),
            } as any)
          ;(CollectionEvent.findLatestByCollectionIdAndTypes as jest.Mock).mockResolvedValue(
            {
              type: CollectionEventType.REVIEW_APPROVED,
              actor_address: 'ethaddress',
              created_at: new Date('2026-11-10T11:00:00.000Z'),
            }
          )
        })

        it('should not record a second review.approved event', async () => {
          await router.updateCollectionCuration(req)

          expect(mockRecordEvent).not.toHaveBeenCalled()
        })
      })
    })

    describe('and the curator reverses a decision on the same request', () => {
      beforeEach(() => {
        jest
          .spyOn(service, 'getLatestById')
          .mockReset()
          .mockResolvedValueOnce({
            id: 'curationId',
            status: CurationStatus.APPROVED,
            created_at: new Date('2026-11-10T10:00:00.000Z'),
          } as any)
        ;(CollectionEvent.findLatestByCollectionIdAndTypes as jest.Mock).mockResolvedValue(
          {
            type: CollectionEventType.REVIEW_APPROVED,
            actor_address: 'ethaddress',
            created_at: new Date('2026-11-10T12:00:00.000Z'),
          }
        )
        req = {
          auth: { ethAddress: 'ethAddress' },
          params: { id: 'some id' },
          body: {
            curation: {
              status: CurationStatus.REJECTED,
              rejectionReasons: ['other'],
              rejectionMessage: 'After all, no',
            },
          },
        } as any
      })

      it('should record the new rejection after the approval it reverses', async () => {
        await router.updateCollectionCuration(req)

        expect(mockRecordEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            type: CollectionEventType.REVIEW_REJECTED,
            payload: {
              rejectionReasons: ['other'],
              rejectionMessage: 'After all, no',
            },
          })
        )
      })
    })

    describe('and another curator repeats the rejection already recorded for this request', () => {
      beforeEach(() => {
        mockIsCommitteeMember.mockReset().mockResolvedValue(true)
        jest
          .spyOn(service, 'getLatestById')
          .mockReset()
          .mockResolvedValueOnce({
            id: 'curationId',
            status: CurationStatus.REJECTED,
            reviewed_by: '0xfirstcurator',
            rejection_reasons: ['clipping'],
            rejection_message: 'Clips through the body',
            created_at: new Date('2026-11-10T10:00:00.000Z'),
          } as any)
        ;(CollectionEvent.findLatestByCollectionIdAndTypes as jest.Mock).mockResolvedValue(
          {
            type: CollectionEventType.REVIEW_REJECTED,
            actor_address: '0xfirstcurator',
            created_at: new Date('2026-11-10T11:00:00.000Z'),
          }
        )
      })

      describe('with the same reasons and message', () => {
        beforeEach(() => {
          req = {
            auth: { ethAddress: 'ethAddress' },
            params: { id: 'some id' },
            body: {
              curation: {
                status: CurationStatus.REJECTED,
                rejectionReasons: ['clipping'],
                rejectionMessage: 'Clips through the body',
              },
            },
          } as any
        })

        it('should keep the first decision on the request and in the timeline', async () => {
          await router.updateCollectionCuration(req)

          expect(updateSpy).toHaveBeenCalledWith('curationId', {
            status: CurationStatus.REJECTED,
            updated_at: expect.any(Date),
          })
          expect(mockRecordEvent).not.toHaveBeenCalled()
          expect(curationNotifications.verdictGiven).not.toHaveBeenCalled()
        })
      })

      describe('with only the reasons corrected', () => {
        beforeEach(() => {
          req = {
            auth: { ethAddress: 'ethAddress' },
            params: { id: 'some id' },
            body: {
              curation: {
                status: CurationStatus.REJECTED,
                rejectionReasons: ['thumbnail'],
              },
            },
          } as any
        })

        it('should record the message the request keeps along with the new reasons', async () => {
          await router.updateCollectionCuration(req)

          expect(mockRecordEvent).toHaveBeenCalledWith(
            expect.objectContaining({
              payload: {
                rejectionReasons: ['thumbnail'],
                rejectionMessage: 'Clips through the body',
              },
            })
          )
        })
      })

      describe('with a blank message and the same reasons', () => {
        beforeEach(() => {
          req = {
            auth: { ethAddress: 'ethAddress' },
            params: { id: 'some id' },
            body: {
              curation: {
                status: CurationStatus.REJECTED,
                rejectionReasons: ['clipping'],
                rejectionMessage: '   ',
              },
            },
          } as any
        })

        it('should treat it as a repeat', async () => {
          await router.updateCollectionCuration(req)

          expect(mockRecordEvent).not.toHaveBeenCalled()
        })
      })

      describe('with corrected reasons', () => {
        beforeEach(() => {
          req = {
            auth: { ethAddress: 'ethAddress' },
            params: { id: 'some id' },
            body: {
              curation: {
                status: CurationStatus.REJECTED,
                rejectionReasons: ['clipping', 'thumbnail'],
                rejectionMessage: 'Clips through the body',
              },
            },
          } as any
        })

        it('should save and record the correction without announcing a new decision', async () => {
          await router.updateCollectionCuration(req)

          expect(updateSpy).toHaveBeenCalledWith(
            'curationId',
            expect.objectContaining({
              rejection_reasons: ['clipping', 'thumbnail'],
            })
          )
          expect(mockRecordEvent).toHaveBeenCalledWith(
            expect.objectContaining({
              type: CollectionEventType.REVIEW_REJECTED,
              payload: {
                rejectionReasons: ['clipping', 'thumbnail'],
                rejectionMessage: 'Clips through the body',
              },
            })
          )
          expect(curationNotifications.verdictGiven).not.toHaveBeenCalled()
        })
      })
    })

    describe('and a retried rejection sends only the reasons after the first attempt saved the row', () => {
      beforeEach(() => {
        jest
          .spyOn(service, 'getLatestById')
          .mockReset()
          .mockResolvedValueOnce({
            id: 'curationId',
            status: CurationStatus.REJECTED,
            reviewed_by: 'ethaddress',
            rejection_reasons: ['clipping'],
            rejection_message: 'Clips through the body',
            created_at: new Date('2026-11-10T10:00:00.000Z'),
          } as any)
        ;(CollectionEvent.findLatestByCollectionIdAndTypes as jest.Mock).mockResolvedValue(
          undefined
        )
        req = {
          auth: { ethAddress: 'ethAddress' },
          params: { id: 'some id' },
          body: {
            curation: {
              status: CurationStatus.REJECTED,
              rejectionReasons: ['clipping'],
            },
          },
        } as any
      })

      it('should record the message the request keeps', async () => {
        await router.updateCollectionCuration(req)

        expect(mockRecordEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            type: CollectionEventType.REVIEW_REJECTED,
            payload: {
              rejectionReasons: ['clipping'],
              rejectionMessage: 'Clips through the body',
            },
          })
        )
      })
    })

    describe('and another instance holds the collection while the auto curation is on', () => {
      beforeEach(() => {
        ;(AutoCurationService.prototype
          .isEnabled as jest.Mock).mockResolvedValue(true)
        ;(withCollectionLock as jest.Mock).mockRejectedValueOnce(
          new CollectionBusyError('some id')
        )
        req = {
          auth: { ethAddress: 'ethAddress' },
          params: { id: 'some id' },
          body: { curation: { status: CurationStatus.APPROVED } },
        } as any
      })

      it('should answer 503 so the curator retries, without updating the request', async () => {
        await expect(
          router.updateCollectionCuration(req)
        ).rejects.toMatchObject({
          statusCode: STATUS_CODES.serviceUnavailable,
        })
        expect(updateSpy).not.toHaveBeenCalled()
      })
    })

    describe('and a curator confirms the rejection the validator made', () => {
      beforeEach(() => {
        jest
          .spyOn(service, 'getLatestById')
          .mockReset()
          .mockResolvedValueOnce({
            id: 'curationId',
            status: CurationStatus.REJECTED,
            reviewed_by: 'validator',
            created_at: new Date('2026-11-10T10:00:00.000Z'),
          } as any)
        req = {
          auth: { ethAddress: 'ethAddress' },
          params: { id: 'some id' },
          body: {
            curation: {
              status: CurationStatus.REJECTED,
              rejectionReasons: ['clipping'],
              rejectionMessage: 'Clips through the body',
            },
          },
        } as any
      })

      it("should record the curator's decision and tell the channel", async () => {
        await router.updateCollectionCuration(req)

        expect(mockRecordEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            type: CollectionEventType.REVIEW_REJECTED,
            actor_address: 'ethaddress',
            payload: {
              rejectionReasons: ['clipping'],
              rejectionMessage: 'Clips through the body',
            },
          })
        )
        expect(curationNotifications.verdictGiven).toHaveBeenCalledWith(
          'some id',
          CurationStatus.REJECTED,
          'ethAddress'
        )
      })
    })
  })
})
