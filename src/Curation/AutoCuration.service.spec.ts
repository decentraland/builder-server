import { v4 as uuidv4 } from 'uuid'
import {
  collectionFragmentMock,
  dbCollectionMock,
  dbTPCollectionMock,
} from '../../spec/mocks/collections'
import { dbItemMock, itemFragmentMock } from '../../spec/mocks/items'
import { Collection } from '../Collection/Collection.model'
import { Item } from '../Item/Item.model'
import { ItemAttributes } from '../Item/Item.types'
import { collectionAPI } from '../ethereum/api/collection'
import { calculateItemContentHash } from '../Item/hashes'
import { isFeatureFlagEnabled } from '../utils/features'
import { curationNotifications } from './notifications'
import { CurationService } from './Curation.service'
import { CurationStatus } from './Curation.types'
import {
  requestValidation as sendValidation,
  ValidationTooLargeError,
} from './validationQueue'
import {
  AutoCurationService,
  ITEM_CHANGES_DELAY_MS,
  MIN_ITEM_CHANGES_INTERVAL_MS,
  resetPendingItemChanges,
} from './AutoCuration.service'

jest.mock('../utils/features')
jest.mock('../Collection/Collection.model')
jest.mock('../Item/Item.model')
jest.mock('../ethereum/api/collection')
jest.mock('./notifications')
jest.mock('../Item/hashes', () => ({
  ...jest.requireActual('../Item/hashes'),
  calculateItemContentHash: jest.fn(),
}))
jest.mock('./validationQueue', () => ({
  ...jest.requireActual('./validationQueue'),
  requestValidation: jest.fn(),
}))

const mockIsFeatureFlagEnabled = isFeatureFlagEnabled as jest.Mock
const mockSendValidation = sendValidation as jest.Mock
const mockNotify = curationNotifications.validationNotRequested as jest.Mock
const mockFindCollection = Collection.findOne as jest.Mock
const mockFindItemsByCollection = Item.findOrderedByCollectionId as jest.Mock
const mockFetchRemoteItems = collectionAPI.fetchItemsByContractAddress as jest.Mock
const mockFetchRemoteCollection = collectionAPI.fetchCollection as jest.Mock
const mockCalculateHash = calculateItemContentHash as jest.Mock

describe('AutoCurationService', () => {
  let service: AutoCurationService
  let item: ItemAttributes

  beforeAll(() => {
    process.env.CHAIN_NAME = 'Sepolia'
    process.env.AWS_SNS_ARN = 'arn:aws:sns:us-east-1:000000000000:events'
  })

  afterAll(() => {
    delete process.env.CHAIN_NAME
    delete process.env.AWS_SNS_ARN
  })

  beforeEach(() => {
    service = new AutoCurationService()
    item = { ...dbItemMock, local_content_hash: 'localHash' }
    mockIsFeatureFlagEnabled.mockResolvedValue(true)
    mockSendValidation.mockResolvedValue(undefined)
    jest.spyOn(console, 'log').mockImplementation(() => undefined)
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    resetPendingItemChanges()
    jest.resetAllMocks()
    jest.restoreAllMocks()
  })

  describe('when a standard collection is published', () => {
    let other: ItemAttributes

    beforeEach(() => {
      other = { ...item, id: uuidv4() }
      mockFindItemsByCollection.mockResolvedValue([item, other])
    })

    it('should request the validation of every item as stored after the publication', async () => {
      await service.onStandardCollectionPublished(dbCollectionMock)

      expect(mockFindItemsByCollection).toHaveBeenCalledWith(
        dbCollectionMock.id
      )
      expect(mockSendValidation).toHaveBeenCalledTimes(1)
      const manifest = mockSendValidation.mock.calls[0][0]
      expect(manifest.collectionId).toBe(dbCollectionMock.id)
      expect(manifest.items.map((i: { itemId: string }) => i.itemId)).toEqual([
        item.id,
        other.id,
      ])
      expect(mockNotify).not.toHaveBeenCalled()
    })

    it('should check the flag as builder-auto-curation', async () => {
      await service.onStandardCollectionPublished(dbCollectionMock)

      expect(mockIsFeatureFlagEnabled).toHaveBeenCalledWith('auto-curation')
    })

    describe('and the flag is off', () => {
      beforeEach(() => {
        mockIsFeatureFlagEnabled.mockResolvedValue(false)
      })

      it('should not request anything', async () => {
        await service.onStandardCollectionPublished(dbCollectionMock)

        expect(mockSendValidation).not.toHaveBeenCalled()
      })
    })

    describe('and the topic is not configured', () => {
      let warnSpy: jest.SpyInstance

      beforeEach(() => {
        delete process.env.AWS_SNS_ARN
        warnSpy = jest
          .spyOn(process.stderr, 'write')
          .mockImplementation(() => true)
      })

      afterEach(() => {
        process.env.AWS_SNS_ARN = 'arn:aws:sns:us-east-1:000000000000:events'
      })

      it('should not request anything and warn once', async () => {
        await service.onStandardCollectionPublished(dbCollectionMock)
        await service.onStandardCollectionPublished(dbCollectionMock)

        expect(mockSendValidation).not.toHaveBeenCalled()
        expect(mockNotify).not.toHaveBeenCalled()
        expect(
          warnSpy.mock.calls.filter((call) =>
            String(call[0]).includes('AWS_SNS_ARN is not set')
          )
        ).toHaveLength(1)
      })
    })

    describe('and the collection is a third party collection', () => {
      it('should not request anything', async () => {
        await service.onStandardCollectionPublished(dbTPCollectionMock)

        expect(mockIsFeatureFlagEnabled).not.toHaveBeenCalled()
        expect(mockSendValidation).not.toHaveBeenCalled()
      })
    })

    describe('and the request is too large', () => {
      beforeEach(() => {
        mockSendValidation.mockRejectedValue(
          new ValidationTooLargeError(300000, 51)
        )
      })

      it('should tell the curators without throwing', async () => {
        await service.onStandardCollectionPublished(dbCollectionMock)

        expect(mockNotify).toHaveBeenCalledWith(
          dbCollectionMock.id,
          'it is too large for the automatic review (51 items, 300000 bytes)'
        )
      })
    })

    describe('and the request cannot be published', () => {
      beforeEach(() => {
        mockSendValidation.mockRejectedValue(new Error('SNS is down'))
      })

      it('should tell the curators without throwing', async () => {
        await service.onStandardCollectionPublished(dbCollectionMock)

        expect(mockNotify).toHaveBeenCalledWith(
          dbCollectionMock.id,
          'the automatic review could not be requested'
        )
      })
    })

    describe('and telling the curators fails too', () => {
      beforeEach(() => {
        mockSendValidation.mockRejectedValue(new Error('SNS is down'))
        mockNotify.mockRejectedValue(new Error('Slack is down'))
      })

      it('should not throw', async () => {
        await expect(
          service.onStandardCollectionPublished(dbCollectionMock)
        ).resolves.toBeUndefined()
      })
    })
  })

  describe('when changes are submitted', () => {
    let changedItem: ItemAttributes
    let unchangedItem: ItemAttributes
    let unhashedItem: ItemAttributes
    let unpublishedItem: ItemAttributes

    beforeEach(() => {
      changedItem = { ...item, id: uuidv4(), blockchain_item_id: '0' }
      unchangedItem = { ...item, id: uuidv4(), blockchain_item_id: '1' }
      unhashedItem = { ...item, id: uuidv4(), blockchain_item_id: '2' }
      unpublishedItem = { ...item, id: uuidv4(), blockchain_item_id: null }
      mockFindCollection.mockResolvedValue(dbCollectionMock)
      mockFindItemsByCollection.mockResolvedValue([
        changedItem,
        unchangedItem,
        unhashedItem,
        unpublishedItem,
      ])
      mockFetchRemoteItems.mockResolvedValue([
        { ...itemFragmentMock, blockchainId: '0', contentHash: 'oldHash' },
        { ...itemFragmentMock, blockchainId: '1', contentHash: 'localHash' },
        { ...itemFragmentMock, blockchainId: '2', contentHash: null },
      ])
    })

    it('should request the validation of the items whose content differs from the chain, skipping the ones not on chain', async () => {
      await service.onChangesSubmitted(dbCollectionMock.id)

      expect(mockFetchRemoteItems).toHaveBeenCalledWith(
        dbCollectionMock.contract_address
      )
      expect(mockCalculateHash).not.toHaveBeenCalled()
      expect(mockSendValidation).toHaveBeenCalledTimes(1)
      const manifest = mockSendValidation.mock.calls[0][0]
      expect(manifest.items.map((i: { itemId: string }) => i.itemId)).toEqual([
        changedItem.id,
        unhashedItem.id,
      ])
    })

    describe('and an item has no stored hash because it was not saved since its publication', () => {
      let untouchedItem: ItemAttributes
      let editedItem: ItemAttributes

      beforeEach(() => {
        untouchedItem = {
          ...item,
          id: uuidv4(),
          blockchain_item_id: '3',
          local_content_hash: null,
        }
        editedItem = {
          ...item,
          id: uuidv4(),
          blockchain_item_id: '4',
          local_content_hash: null,
        }
        mockFindItemsByCollection.mockResolvedValue([untouchedItem, editedItem])
        mockFetchRemoteItems.mockResolvedValue([
          { ...itemFragmentMock, blockchainId: '3', contentHash: 'chainHash' },
          { ...itemFragmentMock, blockchainId: '4', contentHash: 'chainHash' },
        ])
        mockCalculateHash.mockImplementation(async (i: ItemAttributes) =>
          i.id === untouchedItem.id ? 'chainHash' : 'editedHash'
        )
      })

      it('should hash it once and only validate it when the hash differs from the chain', async () => {
        await service.onChangesSubmitted(dbCollectionMock.id)

        expect(mockCalculateHash).toHaveBeenCalledTimes(2)
        expect(mockCalculateHash).toHaveBeenCalledWith(
          untouchedItem,
          dbCollectionMock
        )
        expect(mockSendValidation).toHaveBeenCalledTimes(1)
        const manifest = mockSendValidation.mock.calls[0][0]
        expect(manifest.items).toEqual([
          expect.objectContaining({
            itemId: editedItem.id,
            contentHash: 'editedHash',
          }),
        ])
      })
    })

    describe('and nothing changed', () => {
      beforeEach(() => {
        mockFindItemsByCollection.mockResolvedValue([unchangedItem])
      })

      it('should not request anything', async () => {
        await service.onChangesSubmitted(dbCollectionMock.id)

        expect(mockSendValidation).not.toHaveBeenCalled()
        expect(mockNotify).not.toHaveBeenCalled()
      })
    })

    describe('and the flag is off', () => {
      beforeEach(() => {
        mockIsFeatureFlagEnabled.mockResolvedValue(false)
      })

      it('should not even load the collection', async () => {
        await service.onChangesSubmitted(dbCollectionMock.id)

        expect(mockFindCollection).not.toHaveBeenCalled()
        expect(mockSendValidation).not.toHaveBeenCalled()
      })
    })

    describe('and the collection is a third party collection', () => {
      beforeEach(() => {
        mockFindCollection.mockResolvedValue(dbTPCollectionMock)
      })

      it('should not request anything', async () => {
        await service.onChangesSubmitted(dbTPCollectionMock.id)

        expect(mockFetchRemoteItems).not.toHaveBeenCalled()
        expect(mockSendValidation).not.toHaveBeenCalled()
      })
    })

    describe('and the collection is not on chain', () => {
      beforeEach(() => {
        mockFindCollection.mockResolvedValue({
          ...dbCollectionMock,
          contract_address: null,
        })
      })

      it('should not request anything', async () => {
        await service.onChangesSubmitted(dbCollectionMock.id)

        expect(mockSendValidation).not.toHaveBeenCalled()
      })
    })

    describe('and the graph is down', () => {
      beforeEach(() => {
        mockFetchRemoteItems.mockRejectedValue(new Error('graph timeout'))
      })

      it('should tell the curators without throwing', async () => {
        await expect(
          service.onChangesSubmitted(dbCollectionMock.id)
        ).resolves.toBeUndefined()
        expect(mockSendValidation).not.toHaveBeenCalled()
        expect(mockNotify).toHaveBeenCalledWith(
          dbCollectionMock.id,
          'the automatic review could not be requested'
        )
      })
    })

    describe('and hashing an item fails', () => {
      beforeEach(() => {
        mockFindItemsByCollection.mockResolvedValue([
          {
            ...item,
            id: uuidv4(),
            blockchain_item_id: '5',
            local_content_hash: null,
          },
        ])
        mockCalculateHash.mockRejectedValue(new Error('malformed item'))
      })

      it('should tell the curators without throwing', async () => {
        await service.onChangesSubmitted(dbCollectionMock.id)

        expect(mockSendValidation).not.toHaveBeenCalled()
        expect(mockNotify).toHaveBeenCalledWith(
          dbCollectionMock.id,
          'the automatic review could not be requested'
        )
      })
    })
  })
  describe('when an item of a published standard collection is saved', () => {
    let previous: ItemAttributes
    let saved: ItemAttributes
    let mockGetLatestCuration: jest.SpyInstance
    let settledSpy: jest.SpyInstance

    // Lets the delay go by and waits for the validations it starts.
    async function settle(ms = ITEM_CHANGES_DELAY_MS) {
      jest.advanceTimersByTime(ms)
      await Promise.all(settledSpy.mock.results.map((result) => result.value))
    }

    function requestedItemIds(call = 0): string[] {
      return mockSendValidation.mock.calls[call][0].items.map(
        (i: { itemId: string }) => i.itemId
      )
    }

    beforeEach(() => {
      jest.useFakeTimers()
      previous = {
        ...item,
        id: uuidv4(),
        blockchain_item_id: '0',
        contents: {
          'male/model.glb': 'oldModelHash',
          'thumbnail.png': 'thumbnailHash',
        },
      }
      saved = {
        ...previous,
        contents: { ...previous.contents, 'male/model.glb': 'newModelHash' },
        local_content_hash: 'newLocalHash',
      }
      settledSpy = jest.spyOn(service, 'onItemChangesSettled')
      mockGetLatestCuration = jest
        .spyOn(CurationService.prototype, 'getLatestById')
        .mockResolvedValue(undefined)
      mockFindCollection.mockResolvedValue(dbCollectionMock)
      mockFindItemsByCollection.mockResolvedValue([saved])
      mockFetchRemoteCollection.mockResolvedValue({
        ...collectionFragmentMock,
        isApproved: false,
      })
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    describe('and its files changed', () => {
      it('should request the validation of that item as stored once its saves settle', async () => {
        service.onItemSaved(previous, saved, dbCollectionMock)

        await settle(ITEM_CHANGES_DELAY_MS - 1)
        expect(mockSendValidation).not.toHaveBeenCalled()

        await settle(1)
        expect(mockFindCollection).toHaveBeenCalledWith(dbCollectionMock.id)
        expect(mockSendValidation).toHaveBeenCalledTimes(1)
        const manifest = mockSendValidation.mock.calls[0][0]
        expect(manifest.collectionId).toBe(dbCollectionMock.id)
        expect(manifest.items).toEqual([
          expect.objectContaining({
            itemId: saved.id,
            contentHash: 'newLocalHash',
            contents: saved.contents,
          }),
        ])
        expect(mockNotify).not.toHaveBeenCalled()
      })

      it('should check the flag as builder-auto-curation', async () => {
        service.onItemSaved(previous, saved, dbCollectionMock)
        await settle()

        expect(mockIsFeatureFlagEnabled).toHaveBeenCalledWith('auto-curation')
      })
    })

    describe('and it is saved again before the delay ends', () => {
      let savedAgain: ItemAttributes

      beforeEach(() => {
        savedAgain = {
          ...saved,
          contents: { ...saved.contents, 'male/model.glb': 'newerModelHash' },
          local_content_hash: 'newerLocalHash',
        }
        mockFindItemsByCollection.mockResolvedValue([savedAgain])
      })

      it('should wait for the last save and request one validation of its version', async () => {
        service.onItemSaved(previous, saved, dbCollectionMock)
        await settle(ITEM_CHANGES_DELAY_MS / 2)
        service.onItemSaved(saved, savedAgain, dbCollectionMock)

        await settle(ITEM_CHANGES_DELAY_MS / 2)
        expect(mockSendValidation).not.toHaveBeenCalled()

        await settle(ITEM_CHANGES_DELAY_MS / 2)
        expect(mockSendValidation).toHaveBeenCalledTimes(1)
        expect(mockSendValidation.mock.calls[0][0].items).toEqual([
          expect.objectContaining({
            itemId: savedAgain.id,
            contentHash: 'newerLocalHash',
          }),
        ])
      })
    })

    describe('and another item of the collection changes before the delay ends', () => {
      let otherPrevious: ItemAttributes
      let otherSaved: ItemAttributes

      beforeEach(() => {
        otherPrevious = { ...previous, id: uuidv4(), blockchain_item_id: '1' }
        otherSaved = { ...saved, id: otherPrevious.id, blockchain_item_id: '1' }
        mockFindItemsByCollection.mockResolvedValue([
          saved,
          { ...item, id: uuidv4(), blockchain_item_id: '2' },
          otherSaved,
        ])
      })

      it('should request one validation of both items', async () => {
        service.onItemSaved(previous, saved, dbCollectionMock)
        service.onItemSaved(otherPrevious, otherSaved, dbCollectionMock)
        await settle()

        expect(mockSendValidation).toHaveBeenCalledTimes(1)
        expect(requestedItemIds()).toEqual([saved.id, otherSaved.id])
      })
    })

    describe('and its files went back to the previous ones before the delay ends', () => {
      beforeEach(() => {
        mockFindItemsByCollection.mockResolvedValue([previous])
      })

      it('should not request anything', async () => {
        service.onItemSaved(previous, saved, dbCollectionMock)
        service.onItemSaved(saved, previous, dbCollectionMock)
        await settle()

        expect(mockSendValidation).not.toHaveBeenCalled()
        expect(mockNotify).not.toHaveBeenCalled()
      })
    })

    describe('and its files did not change', () => {
      it('should not request anything', async () => {
        service.onItemSaved(
          previous,
          { ...previous, name: 'A new name' },
          dbCollectionMock
        )
        await settle()

        expect(settledSpy).not.toHaveBeenCalled()
        expect(mockSendValidation).not.toHaveBeenCalled()
      })
    })

    describe('and only files the validator does not receive changed', () => {
      it('should not request anything', async () => {
        service.onItemSaved(
          previous,
          {
            ...previous,
            contents: {
              ...previous.contents,
              'video.mp4': 'videoHash',
              'male/': 'directoryHash',
            },
          },
          dbCollectionMock
        )
        await settle()

        expect(settledSpy).not.toHaveBeenCalled()
        expect(mockSendValidation).not.toHaveBeenCalled()
      })
    })

    describe('and the item is not on chain yet', () => {
      it('should not request anything', async () => {
        service.onItemSaved(
          { ...previous, blockchain_item_id: null },
          { ...saved, blockchain_item_id: null },
          dbCollectionMock
        )
        await settle()

        expect(settledSpy).not.toHaveBeenCalled()
        expect(mockSendValidation).not.toHaveBeenCalled()
      })
    })

    describe('and the collection is a third party collection', () => {
      it('should not request anything', async () => {
        service.onItemSaved(previous, saved, dbTPCollectionMock)
        await settle()

        expect(settledSpy).not.toHaveBeenCalled()
        expect(mockSendValidation).not.toHaveBeenCalled()
      })
    })

    describe('and the flag is off', () => {
      beforeEach(() => {
        mockIsFeatureFlagEnabled.mockResolvedValue(false)
      })

      it('should not even load the collection', async () => {
        service.onItemSaved(previous, saved, dbCollectionMock)
        await settle()

        expect(mockFindCollection).not.toHaveBeenCalled()
        expect(mockSendValidation).not.toHaveBeenCalled()
      })
    })

    describe('and the collection is approved on chain', () => {
      beforeEach(() => {
        mockFetchRemoteCollection.mockResolvedValue({
          ...collectionFragmentMock,
          isApproved: true,
        })
      })

      describe('and its last curation is not pending', () => {
        beforeEach(() => {
          mockGetLatestCuration.mockResolvedValue({
            status: CurationStatus.APPROVED,
          })
        })

        it('should not request anything, as pushing the changes requests their validation', async () => {
          service.onItemSaved(previous, saved, dbCollectionMock)
          await settle()

          expect(mockGetLatestCuration).toHaveBeenCalledWith(
            dbCollectionMock.id
          )
          expect(mockSendValidation).not.toHaveBeenCalled()
          expect(mockNotify).not.toHaveBeenCalled()
        })
      })

      describe('and its last curation is pending', () => {
        beforeEach(() => {
          mockGetLatestCuration.mockResolvedValue({
            status: CurationStatus.PENDING,
          })
        })

        it('should request the validation of the item', async () => {
          service.onItemSaved(previous, saved, dbCollectionMock)
          await settle()

          expect(mockSendValidation).toHaveBeenCalledTimes(1)
          expect(requestedItemIds()).toEqual([saved.id])
        })
      })
    })

    describe('and the collection was never approved and its last curation was rejected', () => {
      beforeEach(() => {
        mockGetLatestCuration.mockResolvedValue({
          status: CurationStatus.REJECTED,
        })
      })

      it('should request the validation of the item', async () => {
        service.onItemSaved(previous, saved, dbCollectionMock)
        await settle()

        expect(mockFetchRemoteCollection).toHaveBeenCalledWith(
          dbCollectionMock.contract_address
        )
        expect(mockSendValidation).toHaveBeenCalledTimes(1)
        expect(requestedItemIds()).toEqual([saved.id])
      })
    })

    describe("and the collection's changes are submitted before the delay ends", () => {
      beforeEach(() => {
        mockFetchRemoteItems.mockResolvedValue([
          { ...itemFragmentMock, blockchainId: '0', contentHash: 'oldHash' },
        ])
      })

      it('should only request the validation of the submitted changes', async () => {
        service.onItemSaved(previous, saved, dbCollectionMock)
        await service.onChangesSubmitted(dbCollectionMock.id)
        expect(mockSendValidation).toHaveBeenCalledTimes(1)

        await settle()
        expect(settledSpy).not.toHaveBeenCalled()
        expect(mockSendValidation).toHaveBeenCalledTimes(1)
      })
    })

    describe("and the collection's changes are submitted while the validation is being prepared", () => {
      let enableFlag: (enabled: boolean) => void

      beforeEach(() => {
        mockIsFeatureFlagEnabled.mockReturnValueOnce(
          new Promise<boolean>((resolve) => {
            enableFlag = resolve
          })
        )
      })

      it('should not send it', async () => {
        service.onItemSaved(previous, saved, dbCollectionMock)
        jest.advanceTimersByTime(ITEM_CHANGES_DELAY_MS)
        expect(settledSpy).toHaveBeenCalledTimes(1)

        service.cancelItemChanges(dbCollectionMock.id)
        enableFlag(true)
        await settledSpy.mock.results[0].value

        expect(mockFindItemsByCollection).toHaveBeenCalled()
        expect(mockSendValidation).not.toHaveBeenCalled()
      })

      it('should still validate the changes saved after it', async () => {
        service.onItemSaved(previous, saved, dbCollectionMock)
        jest.advanceTimersByTime(ITEM_CHANGES_DELAY_MS)
        service.cancelItemChanges(dbCollectionMock.id)
        enableFlag(true)
        await settledSpy.mock.results[0].value

        service.onItemSaved(previous, saved, dbCollectionMock)
        await settle()

        expect(mockSendValidation).toHaveBeenCalledTimes(1)
        expect(requestedItemIds()).toEqual([saved.id])
      })
    })

    describe('and its files change again after their validation was requested', () => {
      let savedAgain: ItemAttributes

      beforeEach(() => {
        savedAgain = {
          ...saved,
          contents: { ...saved.contents, 'male/model.glb': 'newerModelHash' },
          local_content_hash: 'newerLocalHash',
        }
      })

      it('should wait for the minimum interval and then request the validation of the latest version', async () => {
        service.onItemSaved(previous, saved, dbCollectionMock)
        await settle()
        expect(mockSendValidation).toHaveBeenCalledTimes(1)

        mockFindItemsByCollection.mockResolvedValue([savedAgain])
        service.onItemSaved(saved, savedAgain, dbCollectionMock)
        await settle(MIN_ITEM_CHANGES_INTERVAL_MS - 1)
        expect(mockSendValidation).toHaveBeenCalledTimes(1)

        await settle(1)
        expect(mockSendValidation).toHaveBeenCalledTimes(2)
        expect(mockSendValidation.mock.calls[1][0].items).toEqual([
          expect.objectContaining({
            itemId: savedAgain.id,
            contentHash: 'newerLocalHash',
          }),
        ])
      })

      it('should fold the changes made in the meantime into one request', async () => {
        const otherPrevious = {
          ...previous,
          id: uuidv4(),
          blockchain_item_id: '1',
        }
        const otherSaved = {
          ...saved,
          id: otherPrevious.id,
          blockchain_item_id: '1',
        }
        service.onItemSaved(previous, saved, dbCollectionMock)
        await settle()

        mockFindItemsByCollection.mockResolvedValue([savedAgain, otherSaved])
        await settle(10 * 1000)
        service.onItemSaved(saved, savedAgain, dbCollectionMock)
        await settle(5 * 60 * 1000)
        service.onItemSaved(otherPrevious, otherSaved, dbCollectionMock)
        await settle(MIN_ITEM_CHANGES_INTERVAL_MS)

        expect(mockSendValidation).toHaveBeenCalledTimes(2)
        expect(requestedItemIds(1)).toEqual([savedAgain.id, otherSaved.id])
      })
    })

    describe('and its files change again before a validation being prepared reads them', () => {
      let enableFlag: (enabled: boolean) => void
      let savedAgain: ItemAttributes

      beforeEach(() => {
        savedAgain = {
          ...saved,
          contents: { ...saved.contents, 'male/model.glb': 'newerModelHash' },
        }
        mockIsFeatureFlagEnabled.mockReturnValueOnce(
          new Promise<boolean>((resolve) => {
            enableFlag = resolve
          })
        )
      })

      it('should send the files it reads once, not again when the window opened meanwhile ends', async () => {
        service.onItemSaved(previous, saved, dbCollectionMock)
        jest.advanceTimersByTime(ITEM_CHANGES_DELAY_MS)
        mockFindItemsByCollection.mockResolvedValue([savedAgain])
        service.onItemSaved(saved, savedAgain, dbCollectionMock)
        enableFlag(true)
        await settledSpy.mock.results[0].value
        expect(mockSendValidation).toHaveBeenCalledTimes(1)
        expect(mockSendValidation.mock.calls[0][0].items).toEqual([
          expect.objectContaining({
            itemId: savedAgain.id,
            contents: savedAgain.contents,
          }),
        ])

        await settle(MIN_ITEM_CHANGES_INTERVAL_MS)
        expect(settledSpy).toHaveBeenCalledTimes(2)
        expect(mockSendValidation).toHaveBeenCalledTimes(1)
      })
    })

    describe('and its files change again after a validation being prepared read them', () => {
      let savedAgain: ItemAttributes
      let hashReached: Promise<void>
      let releaseHash: (hash: string) => void

      beforeEach(() => {
        savedAgain = {
          ...saved,
          contents: { ...saved.contents, 'male/model.glb': 'newerModelHash' },
        }
        // Without a stored hash the manifest computes one: the test acts while it does.
        mockFindItemsByCollection.mockResolvedValue([
          { ...saved, local_content_hash: null },
        ])
        hashReached = new Promise<void>((resolveReached) => {
          mockCalculateHash.mockImplementationOnce(
            () =>
              new Promise<string>((resolve) => {
                releaseHash = resolve
                resolveReached()
              })
          )
        })
      })

      it('should send the new files once the minimum interval after that validation went by', async () => {
        service.onItemSaved(previous, saved, dbCollectionMock)
        jest.advanceTimersByTime(ITEM_CHANGES_DELAY_MS)
        await hashReached
        service.onItemSaved(saved, savedAgain, dbCollectionMock)
        releaseHash('newLocalHash')
        await settledSpy.mock.results[0].value
        expect(mockSendValidation).toHaveBeenCalledTimes(1)

        mockFindItemsByCollection.mockResolvedValue([savedAgain])
        await settle(ITEM_CHANGES_DELAY_MS)
        expect(mockSendValidation).toHaveBeenCalledTimes(1)

        await settle(MIN_ITEM_CHANGES_INTERVAL_MS - ITEM_CHANGES_DELAY_MS)
        expect(mockSendValidation).toHaveBeenCalledTimes(2)
        expect(mockSendValidation.mock.calls[1][0].items).toEqual([
          expect.objectContaining({
            itemId: savedAgain.id,
            contents: savedAgain.contents,
          }),
        ])
      })

      it("should not send it when the collection's changes are submitted before it is published", async () => {
        service.onItemSaved(previous, saved, dbCollectionMock)
        jest.advanceTimersByTime(ITEM_CHANGES_DELAY_MS)
        await hashReached
        service.cancelItemChanges(dbCollectionMock.id)
        releaseHash('newLocalHash')
        await settledSpy.mock.results[0].value

        expect(mockSendValidation).not.toHaveBeenCalled()
        expect(mockNotify).not.toHaveBeenCalled()
      })
    })

    describe('and the request is too large every time', () => {
      let savedAgain: ItemAttributes

      beforeEach(() => {
        savedAgain = {
          ...saved,
          contents: { ...saved.contents, 'male/model.glb': 'newerModelHash' },
        }
        mockSendValidation.mockRejectedValue(
          new ValidationTooLargeError(300000, 51)
        )
      })

      it('should tell the curators at most once per minimum interval', async () => {
        service.onItemSaved(previous, saved, dbCollectionMock)
        await settle()
        expect(mockNotify).toHaveBeenCalledTimes(1)

        mockFindItemsByCollection.mockResolvedValue([savedAgain])
        service.onItemSaved(saved, savedAgain, dbCollectionMock)
        await settle()
        expect(mockNotify).toHaveBeenCalledTimes(1)

        await settle(MIN_ITEM_CHANGES_INTERVAL_MS - ITEM_CHANGES_DELAY_MS)
        expect(mockNotify).toHaveBeenCalledTimes(2)
        expect(mockNotify).toHaveBeenLastCalledWith(
          dbCollectionMock.id,
          'it is too large for the automatic review (51 items, 300000 bytes)'
        )
      })
    })

    describe('and the request cannot be published', () => {
      beforeEach(() => {
        mockSendValidation.mockRejectedValue(new Error('SNS is down'))
      })

      it('should tell the curators without throwing', async () => {
        service.onItemSaved(previous, saved, dbCollectionMock)
        await settle()

        expect(mockNotify).toHaveBeenCalledWith(
          dbCollectionMock.id,
          'the automatic review could not be requested'
        )
      })
    })

    describe('and the collection cannot be read', () => {
      beforeEach(() => {
        mockFindCollection.mockRejectedValue(new Error('database is down'))
      })

      it('should tell the curators without throwing', async () => {
        service.onItemSaved(previous, saved, dbCollectionMock)
        await settle()

        expect(mockSendValidation).not.toHaveBeenCalled()
        expect(mockNotify).toHaveBeenCalledWith(
          dbCollectionMock.id,
          'the automatic review could not be requested'
        )
      })
    })

    describe('and the saved item cannot be read', () => {
      it('should not throw', () => {
        expect(() =>
          service.onItemSaved(
            (undefined as unknown) as ItemAttributes,
            saved,
            dbCollectionMock
          )
        ).not.toThrow()
      })
    })
  })
})
