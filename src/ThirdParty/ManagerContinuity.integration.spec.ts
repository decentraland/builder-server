import supertest from 'supertest'
import {
  createAuthHeaders,
  buildURL,
  mockExistsMiddleware,
} from '../../spec/utils'
import { wallet } from '../../spec/mocks/wallet'
import {
  dbTPCollectionMock,
  thirdPartyFragmentMock,
} from '../../spec/mocks/collections'
import { app } from '../server'
import { Collection } from '../Collection/Collection.model'
import { Item } from '../Item/Item.model'
import { ItemCuration } from '../Curation/ItemCuration'
import { thirdPartyAPI } from '../ethereum/api/thirdParty'
import { ThirdPartyCollectionAttributes } from '../Collection/Collection.types'
import { VirtualThirdParty } from './VirtualThirdParty.model'
import { VirtualThirdPartyAttributes } from './VirtualThirdParty.types'

const server = supertest(app.getApp())

jest.mock('../ethereum/api/thirdParty')
jest.mock('../Item/Item.model')
jest.mock('../Curation/ItemCuration')
jest.mock('./VirtualThirdParty.model')
jest.mock('../Collection/Collection.model')

const thirdPartyAPIMock = thirdPartyAPI as jest.Mocked<typeof thirdPartyAPI>
const VirtualThirdPartyMock = VirtualThirdParty as jest.Mocked<
  typeof VirtualThirdParty
>

describe('when the ownership of a third party collection is resolved end to end', () => {
  let collection: ThirdPartyCollectionAttributes
  let virtualThirdParty: VirtualThirdPartyAttributes

  beforeEach(() => {
    collection = {
      ...dbTPCollectionMock,
      contract_address: null,
      lock: null,
    }
    virtualThirdParty = {
      id: collection.third_party_id,
      managers: ['0xanotherwallet'],
      raw_metadata: 'tp:1:name:description',
      isProgrammatic: false,
      created_at: new Date(),
      updated_at: new Date(),
    }
    ;(Collection.findOne as jest.Mock).mockResolvedValue(collection)
    ;(Collection.findByIds as jest.Mock).mockResolvedValue([collection])
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and the indexed record lists a wallet that is not a virtual manager', () => {
    let url: string

    beforeEach(() => {
      url = `/collections/${collection.id}`
      mockExistsMiddleware(Collection, collection.id)
      thirdPartyAPIMock.fetchThirdParty.mockResolvedValue({
        ...thirdPartyFragmentMock,
        managers: [wallet.address],
      })
      VirtualThirdPartyMock.findOne.mockResolvedValue(virtualThirdParty)
    })

    it('should respond DELETE /collections/:id with a 401', () => {
      return server
        .delete(buildURL(url))
        .set(createAuthHeaders('delete', url))
        .expect(401)
    })

    it('should not delete the collection rows', async () => {
      await server
        .delete(buildURL(url))
        .set(createAuthHeaders('delete', url))
        .expect(401)
      expect(Collection.delete).not.toHaveBeenCalled()
      expect(VirtualThirdParty.delete).not.toHaveBeenCalled()
    })
  })

  describe('and the indexed record for an unrelated id lists the wallet without a virtual record', () => {
    let url: string

    beforeEach(() => {
      url = `/collections/${collection.id}`
      mockExistsMiddleware(Collection, collection.id)
      thirdPartyAPIMock.fetchThirdParty.mockResolvedValue({
        ...thirdPartyFragmentMock,
        id: collection.third_party_id,
        managers: [wallet.address],
      })
      VirtualThirdPartyMock.findOne.mockResolvedValue(undefined)
      ;(ItemCuration.existsByCollectionId as jest.Mock).mockResolvedValue(false)
      ;(Collection.delete as jest.Mock).mockResolvedValue(undefined)
      ;(Item.delete as jest.Mock).mockResolvedValue(undefined)
    })

    it('should respond DELETE /collections/:id with a 200', () => {
      return server
        .delete(buildURL(url))
        .set(createAuthHeaders('delete', url))
        .expect(200)
    })
  })
})
