import supertest from 'supertest'
import { ethers } from 'ethers'
import { utils } from 'decentraland-commons'
import { AuthIdentity } from '@dcl/crypto'
import {
  buildURL,
  createAuthHeaders,
  mockExistsMiddleware,
} from '../spec/utils'
import { createIdentity, fakePrivateKey } from '../spec/mocks/wallet'
import { dbCollectionMock, dbTPCollectionMock } from '../spec/mocks/collections'
import { dbTPItemMock } from '../spec/mocks/items'
import { itemCurationMock } from '../spec/mocks/itemCuration'
import { app } from './server'
import { Collection } from './Collection/Collection.model'
import { CollectionService } from './Collection/Collection.service'
import { ThirdPartyCollectionAttributes } from './Collection/Collection.types'
import { Item } from './Item/Item.model'
import { ItemService } from './Item/Item.service'
import { ItemAttributes } from './Item/Item.types'
import { SlotUsageCheque } from './SlotUsageCheque'
import { ItemCuration } from './Curation/ItemCuration'
import { CollectionCuration } from './Curation/CollectionCuration'
import { ThirdPartyService } from './ThirdParty/ThirdParty.service'
import { isCommitteeMember } from './Committee'
import { CurationStatus } from './Curation'
import * as warehouse from './warehouse'
import { buildTPItemURN } from './Item/utils'

jest.mock('./ethereum/api/collection')
jest.mock('./ethereum/api/peer')
jest.mock('./utils/eth')
jest.mock('./Forum/client')
jest.mock('./SlotUsageCheque')
jest.mock('./Curation/ItemCuration')
jest.mock('./Curation/CollectionCuration')
jest.mock('./ThirdParty/ThirdParty.service')
jest.mock('./Committee')
jest.mock('./Item/Item.model')
jest.mock('./Collection/Collection.model')
// ./Collection/access intentionally NOT mocked: the curation cases must hit the
// real CurationService.hasAccess, not an auto-mock (which made them vacuous).
jest.mock('./warehouse')

const server = supertest(app.getApp())

describe('unauthorized attacker with a valid auth chain of its own', () => {
  let attackerIdentity: AuthIdentity
  let attackerAddress: string
  let url: string

  beforeAll(async () => {
    const attackerWallet = new ethers.Wallet(fakePrivateKey)
    attackerAddress = attackerWallet.address.toLowerCase()
    attackerIdentity = await createIdentity(attackerWallet, attackerWallet, 1)
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  const attackerHeaders = (method: string, path: string) =>
    createAuthHeaders(method, path, attackerIdentity)

  it('is not the owner of the collections it attacks', () => {
    expect(attackerAddress).not.toBe(dbCollectionMock.eth_address)
    expect(attackerAddress).not.toBe(dbTPCollectionMock.eth_address)
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
        .set(attackerHeaders('post', url))
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
        .set(attackerHeaders('post', url))
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
        .set(attackerHeaders('post', url))
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
        .set(attackerHeaders('patch', url))
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
        .set(attackerHeaders('put', url))
        .send({ item: itemToUpsert })
        .expect(401)
        .then(() => {
          expect(Item.upsert).not.toHaveBeenCalled()
        })
    })
  })

  describe('when reaching the publish service directly, bypassing the route', () => {
    it('should refuse a non-manager without writing anything', async () => {
      ;(ThirdPartyService.isManager as jest.Mock).mockResolvedValue(false)

      await expect(
        new CollectionService().publishTPCollection(
          [dbTPItemMock.id],
          dbTPCollectionMock as ThirdPartyCollectionAttributes,
          attackerAddress,
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
        .set(attackerHeaders('patch', url))
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
        .set(attackerHeaders('post', url))
        .send({ email: 'attacker@example.com' })
        .expect(401)
        .then(() => {
          expect(warehouse.sendDataToWarehouse).not.toHaveBeenCalled()
        })
    })
  })
})
