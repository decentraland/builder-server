import { constants } from 'ethers'
import { Rarity, ThirdPartyWearable } from '@dcl/schemas'
import { v4 as uuidv4 } from 'uuid'
import {
  ItemFragment,
  ThirdPartyItemFragment,
  ThirdPartyItemMetadataType,
} from '../../src/ethereum/api/fragments'
import { Bridge } from '../../src/ethereum/api/Bridge'
import {
  FullItem,
  ItemAttributes,
  ItemType,
  ThirdPartyItemAttributes,
} from '../../src/Item/Item.types'
import { toUnixTimestamp } from '../../src/utils/parse'
import { buildTPItemURN } from '../../src/Item/utils'
import { CollectionAttributes } from '../../src/Collection'
import { WearableBodyShape } from '../../src/Item/wearable/types'
import { isTPCollection } from '../../src/utils/urn'
import { CatalystItem } from '../../src/ethereum/api/peer'
import { dbCollectionMock, dbTPCollectionMock } from './collections'

export type ResultItem = Omit<FullItem, 'created_at' | 'updated_at'> & {
  created_at: string
  updated_at: string
}

export function toResultItem(
  itemAttributes: ItemAttributes,
  itemFragment?: ItemFragment,
  catalystItem?: CatalystItem,
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
    catalyst_content_hash: null,
  }
  delete (resultItem as Omit<typeof resultItem, 'urn_suffix'> & {
    urn_suffix: unknown
  }).urn_suffix

  return resultItem
}

export function asResultItem(item: ItemAttributes): ResultItem {
  return {
    ...Bridge.toFullItem(item),
    created_at: item.created_at.toISOString(),
    updated_at: item.updated_at.toISOString(),
  }
}

export function toResultTPItem(
  itemAttributes: ItemAttributes,
  dbCollection?: CollectionAttributes,
  catalystItem?: ThirdPartyWearable
): ResultItem {
  const hasURN =
    itemAttributes.urn_suffix && dbCollection && isTPCollection(dbCollection)

  const resultItem = {
    ...itemAttributes,
    created_at: itemAttributes.created_at.toISOString(),
    updated_at: itemAttributes.updated_at.toISOString(),
    is_approved: true,
    in_catalyst: true,
    is_published: true,
    urn: hasURN
      ? buildTPItemURN(
          dbCollection!.third_party_id!,
          dbCollection!.urn_suffix!,
          itemAttributes!.urn_suffix!
        )
      : null,
    blockchain_item_id: itemAttributes.urn_suffix,
    total_supply: 0,
    price: '0',
    beneficiary: constants.AddressZero,
    content_hash: null,
    catalyst_content_hash: catalystItem
      ? catalystItem?.merkleProof.entityHash
      : null,
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
  rarity: Rarity.COMMON,
  type: ItemType.WEARABLE,
  data: {
    representations: [
      {
        bodyShapes: [WearableBodyShape.MALE],
        mainFile: 'male/M_3LAU_Hat_Blue.glb',
        contents: ['male/M_3LAU_Hat_Blue.glb'],
        overrideHides: [],
        overrideReplaces: [],
      },
    ],
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
  contents: {
    'male/M_3LAU_Hat_Blue.glb':
      'QmebRdUS12afshxzNtTb2h6UhSXjMrGTGeZWcwwtmhTJng',
    'thumbnail.png': 'QmPP232rkN2UDg8yGAyJ6hkHGsDFwXivcv9MXFfnW8r34y',
  },
  created_at: new Date(),
  updated_at: new Date(),
  local_content_hash: null,
}

export const dbTPItemMock: ThirdPartyItemAttributes = {
  ...dbItemMock,
  id: uuidv4(),
  blockchain_item_id: null,
  collection_id: dbTPCollectionMock.id,
  urn_suffix: '1',
  local_content_hash: 'aHash',
}

export const itemFragmentMock = {
  id: dbCollectionMock.contract_address + '-' + dbItemMock.blockchain_item_id,
  blockchainId: '0',
  urn: `urn:decentraland:mumbai:collections-v2:${dbCollectionMock.contract_address}:${dbItemMock.blockchain_item_id}`,
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
