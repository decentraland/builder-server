import { v4 as uuidv4 } from 'uuid'
import { Wearable } from '../../src/ethereum/api/peer'
import {
  ItemFragment,
  ThirdPartyItemFragment,
  ThirdPartyItemMetadataType,
} from '../../src/ethereum/api/fragments'
import {
  FullItem,
  ItemAttributes,
  ItemRarity,
  ItemType,
  ThirdPartyItemAttributes,
} from '../../src/Item/Item.types'
import { dbCollectionMock, dbTPCollectionMock } from './collections'
import { toUnixTimestamp } from '../../src/utils/parse'
import { buildTPItemURN } from '../../src/Item/utils'
import { CollectionAttributes } from '../../src/Collection'
import { isTPCollection } from '../../src/Collection/utils'

export type ResultItem = Omit<FullItem, 'created_at' | 'updated_at'> & {
  created_at: string
  updated_at: string
}

export function toResultItem(
  itemAttributes: ItemAttributes,
  itemFragment?: ItemFragment,
  catalystItem?: Wearable,
  dbCollection?: CollectionAttributes
): ResultItem {
  const hasURN =
    itemAttributes.urn_suffix && dbCollection && isTPCollection(dbCollection)

  const resultItem = {
    ...itemAttributes,
    created_at: itemAttributes.created_at.toISOString(),
    updated_at: itemAttributes.updated_at.toISOString(),
    in_catalyst: Boolean(catalystItem),
    is_approved: false,
    is_published:
      Boolean(itemAttributes.collection_id) &&
      Boolean(itemAttributes.blockchain_item_id),
    urn: hasURN
      ? buildTPItemURN(
          dbCollection!.third_party_id!,
          dbCollection!.urn_suffix!,
          itemAttributes!.urn_suffix!
        )
      : null,
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
  collection_id: dbCollectionMock.id,
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

export const dbTPItemMock: ThirdPartyItemAttributes = {
  ...dbItemMock,
  collection_id: dbTPCollectionMock.id,
  urn_suffix: '1',
}

export const itemFragmentMock = {
  id: dbCollectionMock.contract_address + '-' + dbItemMock.blockchain_item_id,
  blockchainId: '0',
  urn: `urn:decentraland:ropsten:collections-v2:${dbCollectionMock.contract_address}:${dbItemMock.blockchain_item_id}`,
  totalSupply: '1',
  price: dbItemMock.price!.toString(),
  beneficiary: 'aBeneficiary',
  minters: [],
  managers: [],
  collection: {
    id: dbCollectionMock.id,
    creator: 'aCreator',
    owner: 'anOwner',
    name: dbCollectionMock.name,
    isApproved: dbCollectionMock.is_approved,
    minters: [],
    managers: [],
    reviewedAt: toUnixTimestamp(dbCollectionMock.reviewed_at!),
    updatedAt: toUnixTimestamp(dbCollectionMock.updated_at),
    createdAt: toUnixTimestamp(dbCollectionMock.created_at),
  },
  metadata: {},
  contentHash: '',
}

export const thirdPartyItemFragmentMock: ThirdPartyItemFragment = {
  urn: buildTPItemURN(
    dbTPCollectionMock.third_party_id,
    dbTPCollectionMock.urn_suffix,
    dbTPItemMock.urn_suffix
  ),
  blockchainItemId: '1',
  contentHash: '',
  isApproved: true,
  metadata: {
    type: ThirdPartyItemMetadataType.third_party_v1,
    itemWearable: {
      name: 'Fragment Name',
      description: null,
      category: null,
      bodyShapes: null,
    },
  },
  thirdParty: {
    id: dbTPCollectionMock.third_party_id,
  },
  reviewedAt: toUnixTimestamp(dbTPCollectionMock.reviewed_at!),
  updatedAt: toUnixTimestamp(dbTPCollectionMock.updated_at),
  createdAt: toUnixTimestamp(dbTPCollectionMock.created_at),
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
