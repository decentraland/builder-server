import { v4 as uuidv4 } from 'uuid'
import {
  dbCollectionMock,
  dbTPCollectionMock,
} from '../../spec/mocks/collections'
import { dbItemMock, itemFragmentMock } from '../../spec/mocks/items'
import { Collection } from '../Collection/Collection.model'
import { Item } from '../Item/Item.model'
import { ItemAttributes } from '../Item/Item.types'
import { collectionAPI } from '../ethereum/api/collection'
import { isFeatureFlagEnabled } from '../utils/features'
import { curationNotifications } from './notifications'
import {
  requestValidation as sendValidation,
  ValidationTooLargeError,
} from './validationQueue'
import { AutoCurationService } from './AutoCuration.service'

jest.mock('../utils/features')
jest.mock('../Collection/Collection.model')
jest.mock('../Item/Item.model')
jest.mock('../ethereum/api/collection')
jest.mock('./notifications')
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

describe('AutoCurationService', () => {
  let service: AutoCurationService
  let item: ItemAttributes

  beforeAll(() => {
    process.env.CHAIN_NAME = 'Sepolia'
  })

  afterAll(() => {
    delete process.env.CHAIN_NAME
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
      expect(mockSendValidation).toHaveBeenCalledTimes(1)
      const manifest = mockSendValidation.mock.calls[0][0]
      expect(manifest.items.map((i: { itemId: string }) => i.itemId)).toEqual([
        changedItem.id,
        unhashedItem.id,
      ])
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

      it('should not throw', async () => {
        await expect(
          service.onChangesSubmitted(dbCollectionMock.id)
        ).resolves.toBeUndefined()
        expect(mockSendValidation).not.toHaveBeenCalled()
      })
    })
  })
})
