import { v4 as uuidv4 } from 'uuid'
import { CollectionAttributes } from '../../src/Collection'
import { wallet } from '../utils'

export const collectionAttributesMock: CollectionAttributes = {
  id: uuidv4(),
  name: 'Test',
  urn_suffix: null,
  eth_address: wallet.address,
  salt: '',
  contract_address: '0x02b6bD2420cCADC38726BD34BB7f5c52B3F4F3ff',
  is_published: false,
  is_approved: false,
  minters: [],
  managers: [],
  forum_link: null,
  lock: null,
  reviewed_at: new Date(),
  created_at: new Date(),
  updated_at: new Date(),
}
