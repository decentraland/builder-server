import supertest from 'supertest'
import { ethers } from 'ethers'
import { utils } from 'decentraland-commons'
import { AuthIdentity } from '@dcl/crypto'
import {
  buildURL,
  createAuthHeaders,
  mockExistsMiddleware,
} from '../../spec/utils'
import { createIdentity, fakePrivateKey } from '../../spec/mocks/wallet'
import {
  dbCollectionMock,
  dbTPCollectionMock,
} from '../../spec/mocks/collections'
import { dbTPItemMock } from '../../spec/mocks/items'
import { itemCurationMock } from '../../spec/mocks/itemCuration'
import { app } from '../../src/server'
import { Collection } from '../../src/Collection/Collection.model'
import { CollectionService } from '../../src/Collection/Collection.service'
import { ThirdPartyCollectionAttributes } from '../../src/Collection/Collection.types'
import { Item } from '../../src/Item/Item.model'
import { ItemService } from '../../src/Item/Item.service'
import { ItemAttributes } from '../../src/Item/Item.types'
import { SlotUsageCheque } from '../../src/SlotUsageCheque'
import { ItemCuration } from '../../src/Curation/ItemCuration'
import { CollectionCuration } from '../../src/Curation/CollectionCuration'
import { ThirdPartyService } from '../../src/ThirdParty/ThirdParty.service'
import { isCommitteeMember } from '../../src/Committee'
import { CurationStatus } from '../../src/Curation'
import * as warehouse from '../../src/warehouse'
import { buildTPItemURN } from '../../src/Item/utils'

jest.mock('../../src/ethereum/api/collection')
jest.mock('../../src/ethereum/api/peer')
jest.mock('../../src/utils/eth')
jest.mock('../../src/Forum/client')
jest.mock('../../src/SlotUsageCheque')
jest.mock('../../src/Curation/ItemCuration')
jest.mock('../../src/Curation/CollectionCuration')
jest.mock('../../src/ThirdParty/ThirdParty.service')
jest.mock('../../src/Committee')
jest.mock('../../src/Item/Item.model')
jest.mock('../../src/Collection/Collection.model')
// src/Collection/access intentionally NOT mocked: the curation cases must hit the
// real CurationService.hasAccess, not an auto-mock (which made them vacuous).
jest.mock('../../src/warehouse')

const server = supertest(app.getApp())

describe('when a signed request targets a collection the caller does not own', () => {
  let nonOwnerIdentity: AuthIdentity
  let nonOwnerAddress: string
  let url: string

  beforeAll(async () => {
    const nonOwnerWallet = new ethers.Wallet(fakePrivateKey)
    nonOwnerAddress = nonOwnerWallet.address.toLowerCase()
    nonOwnerIdentity = await createIdentity(nonOwnerWallet, nonOwnerWallet, 1)
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  const nonOwnerHeaders = (method: string, path: string) =>
    createAuthHeaders(method, path, nonOwnerIdentity)

  it('uses an identity that owns none of the collections under test', () => {
    expect(nonOwnerAddress).not.toBe(dbCollectionMock.eth_address)
    expect(nonOwnerAddress).not.toBe(dbTPCollectionMock.eth_address)
  })

  describe('when publishing a third party collection it does not manage', () => {
    beforeEach(() => {
      url = `/collections/${dbTPCollectionMock.id}/publish`
      mockExistsMiddleware(Collection, dbTPCollectionMock.id)
      ;(Collection.findOne as jest.Mock).mockResolvedValueOnce(
        dbTPCollectionMock
      )
      ;(ThirdPartyService.isManager as jest.Mock).mockResolvedValue(false)
    })

    it('should be rejected without creating a cheque or any curation', () => {
      return server
        .post(buildURL(url))
        .set(nonOwnerHeaders('post', url))
        .send({
          itemIds: [dbTPItemMock.id],
          cheque: { signature: 'signature', qty: 1, salt: '0xsalt' },
        })
        .expect(401)
        .then(() => {
          expect(SlotUsageCheque.create).not.toHaveBeenCalled()
          expect(ItemCuration.create).not.toHaveBeenCalled()
          expect(CollectionCuration.create).not.toHaveBeenCalled()
        })
    })
  })

  describe('when publishing a standard collection it does not own', () => {
    beforeEach(() => {
      url = `/collections/${dbCollectionMock.id}/publish`
      mockExistsMiddleware(Collection, dbCollectionMock.id)
      ;(Collection.findOne as jest.Mock).mockResolvedValueOnce(undefined)
    })

    it('should be rejected without touching any item', () => {
      return server
        .post(buildURL(url))
        .set(nonOwnerHeaders('post', url))
        .send({ itemIds: [] })
        .expect(401)
        .then(() => {
          expect(Item.update).not.toHaveBeenCalled()
        })
    })
  })

  describe('when sending a collection it does not manage to review', () => {
    beforeEach(() => {
      url = `/collections/${dbTPCollectionMock.id}/curation`
      ;(Collection.findOne as jest.Mock).mockResolvedValue(dbTPCollectionMock)
      ;(ItemCuration.findLastByCollectionId as jest.Mock).mockResolvedValue(
        itemCurationMock
      )
      ;(isCommitteeMember as jest.Mock).mockResolvedValue(false)
      ;(ThirdPartyService.isManager as jest.Mock).mockResolvedValue(false)
    })

    it('should be rejected without creating a collection curation', () => {
      return server
        .post(buildURL(url))
        .set(nonOwnerHeaders('post', url))
        .send({})
        .expect(401)
        .then(() => {
          expect(CollectionCuration.create).not.toHaveBeenCalled()
        })
    })
  })

  describe('when approving the curation of a collection it does not manage', () => {
    beforeEach(() => {
      url = `/collections/${dbTPCollectionMock.id}/curation`
      ;(Collection.findOne as jest.Mock).mockResolvedValue(dbTPCollectionMock)
      ;(ItemCuration.findLastByCollectionId as jest.Mock).mockResolvedValue(
        itemCurationMock
      )
      ;(isCommitteeMember as jest.Mock).mockResolvedValue(false)
      ;(ThirdPartyService.isManager as jest.Mock).mockResolvedValue(false)
    })

    it('should be rejected without updating the curation', () => {
      return server
        .patch(buildURL(url))
        .set(nonOwnerHeaders('patch', url))
        .send({ curation: { status: CurationStatus.APPROVED } })
        .expect(401)
        .then(() => {
          expect(CollectionCuration.update).not.toHaveBeenCalled()
        })
    })
  })

  describe('when editing an item of a collection it does not manage', () => {
    beforeEach(() => {
      url = `/items/${dbTPItemMock.id}`
      ;(Item.findOne as jest.Mock).mockResolvedValueOnce({
        ...dbTPItemMock,
        collection_id: dbTPCollectionMock.id,
      })
      ;(Collection.findByIds as jest.Mock).mockResolvedValueOnce([
        dbTPCollectionMock,
      ])
      ;(ThirdPartyService.isManager as jest.Mock).mockResolvedValue(false)
    })

    it('should be rejected without upserting the item', () => {
      const itemToUpsert = {
        ...utils.omit<ItemAttributes>(dbTPItemMock, [
          'created_at',
          'updated_at',
        ]),
        collection_id: dbTPCollectionMock.id,
        urn: buildTPItemURN(
          dbTPCollectionMock.third_party_id,
          dbTPCollectionMock.urn_suffix,
          dbTPItemMock.urn_suffix!
        ),
      }

      return server
        .put(buildURL(url))
        .set(nonOwnerHeaders('put', url))
        .send({ item: itemToUpsert })
        .expect(401)
        .then(() => {
          expect(Item.upsert).not.toHaveBeenCalled()
        })
    })
  })

  describe('when calling the publish service directly rather than through the route', () => {
    it('should refuse a non-manager without writing anything', async () => {
      ;(ThirdPartyService.isManager as jest.Mock).mockResolvedValue(false)

      await expect(
        new CollectionService().publishTPCollection(
          [dbTPItemMock.id],
          dbTPCollectionMock as ThirdPartyCollectionAttributes,
          nonOwnerAddress,
          { signature: 'signature', qty: 1, salt: '0xsalt' }
        )
      ).rejects.toThrow('Unauthorized to upsert collection')

      expect(SlotUsageCheque.create).not.toHaveBeenCalled()
      expect(ItemCuration.create).not.toHaveBeenCalled()
      expect(CollectionCuration.create).not.toHaveBeenCalled()
    })
  })

  describe('when an authorized caller that is not on the committee approves a curation', () => {
    let deploySpy: jest.SpyInstance

    beforeEach(() => {
      url = `/collections/${dbTPCollectionMock.id}/curation`
      ;(Collection.findOne as jest.Mock).mockResolvedValue(dbTPCollectionMock)
      ;(ItemCuration.findLastByCollectionId as jest.Mock).mockResolvedValue(
        itemCurationMock
      )
      ;(ThirdPartyService.isManager as jest.Mock).mockResolvedValue(true)
      ;(isCommitteeMember as jest.Mock).mockResolvedValue(false)
      ;(CollectionCuration.query as jest.Mock).mockResolvedValue([
        { id: 'curationId' },
      ])
      deploySpy = jest
        .spyOn(ItemService.prototype, 'updateDCLItemsContent')
        .mockResolvedValue(undefined as any)
    })

    it('should be rejected by the committee gate without approving or deploying', () => {
      return server
        .patch(buildURL(url))
        .set(nonOwnerHeaders('patch', url))
        .send({ curation: { status: CurationStatus.APPROVED } })
        .expect(401)
        .then((response) => {
          expect(JSON.stringify(response.body)).toContain(
            'Only committee members can approve or reject a curation'
          )
          expect(deploySpy).not.toHaveBeenCalled()
        })
    })
  })

  describe('when saving the ToS of a collection it does not own', () => {
    beforeEach(() => {
      url = `/collections/${dbCollectionMock.id}/tos`
      mockExistsMiddleware(Collection, dbCollectionMock.id)
      ;(Collection.findOne as jest.Mock).mockResolvedValueOnce(undefined)
    })

    it('should be rejected without sending anything to the warehouse', () => {
      return server
        .post(buildURL(url))
        .set(nonOwnerHeaders('post', url))
        .send({ email: 'non.owner@example.com' })
        .expect(401)
        .then(() => {
          expect(warehouse.sendDataToWarehouse).not.toHaveBeenCalled()
        })
    })
  })
})
