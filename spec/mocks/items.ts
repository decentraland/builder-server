import { v4 as uuidv4 } from 'uuid'
import { Wearable } from '../../src/ethereum/api/peer'
import { ItemFragment } from '../../src/ethereum/api/fragments'
import {
  FullItem,
  ItemAttributes,
  ItemRarity,
  ItemType,
} from '../../src/Item/Item.types'
import { collectionAttributesMock } from './collections'

export type ResultItem = Omit<FullItem, 'created_at' | 'updated_at'> & {
  created_at: string
  updated_at: string
}

export function toResultItem(
  itemAttributes: ItemAttributes,
  itemFragment?: ItemFragment,
  catalystItem?: Wearable
): ResultItem {
  const resultItem = {
    ...itemAttributes,
    created_at: itemAttributes.created_at.toISOString(),
    updated_at: itemAttributes.updated_at.toISOString(),
    in_catalyst: Boolean(catalystItem),
    is_approved: false,
    is_published:
      Boolean(itemAttributes.collection_id) &&
      Boolean(itemAttributes.blockchain_item_id),
    urn: null,
    total_supply: itemFragment?.totalSupply
      ? Number(itemFragment?.totalSupply)
      : 0,
    content_hash: itemFragment?.contentHash || null,
  }
  delete (resultItem as Omit<typeof resultItem, 'urn_suffix'> & {
    urn_suffix: unknown
  }).urn_suffix

  return resultItem
}

export const dbItemMock: ItemAttributes = {
  id: uuidv4(),
  urn_suffix: null,
  name: 'Test',
  description: '',
  thumbnail: '',
  eth_address: '',
  collection_id: collectionAttributesMock.id,
  blockchain_item_id: '0',
  price: '',
  beneficiary: '',
  rarity: ItemRarity.COMMON,
  type: ItemType.WEARABLE,
  data: {
    representations: [],
    replaces: [],
    hides: [],
    tags: [],
  },
  metrics: {
    meshes: 1,
    bodies: 2,
    materials: 3,
    textures: 4,
    triangles: 5,
    entities: 6,
  },
  contents: {},
  created_at: new Date(),
  updated_at: new Date(),
}

export const itemURNMock = `urn:decentraland:ropsten:collections-v2:${collectionAttributesMock.contract_address}:${dbItemMock.blockchain_item_id}`

export const itemFragmentMock = {
  id:
    collectionAttributesMock.contract_address +
    '-' +
    dbItemMock.blockchain_item_id,
  blockchainId: '0',
  urn: itemURNMock,
  totalSupply: '1',
  price: dbItemMock.price!.toString(),
  beneficiary: 'aBeneficiary',
  minters: [],
  managers: [],
  collection: {
    id: collectionAttributesMock.id,
    creator: 'aCreator',
    owner: 'anOwner',
    name: collectionAttributesMock.name,
    isApproved: collectionAttributesMock.is_approved,
    minters: [],
    managers: [],
    reviewedAt: collectionAttributesMock.reviewed_at!.toISOString(),
    updatedAt: collectionAttributesMock.updated_at.toISOString(),
    createdAt: collectionAttributesMock.created_at.toISOString(),
  },
  metadata: {},
  contentHash: '',
}

export function convertItemDatesToISO<T extends ItemAttributes | FullItem>(
  item: T
): Omit<T, 'reviewed_at' | 'created_at' | 'updated_at'> & {
  created_at: string
  updated_at: string
} {
  return {
    ...item,
    created_at: item.created_at.toISOString(),
    updated_at: item.updated_at.toISOString(),
  }
}
