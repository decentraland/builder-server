import { v4 as uuidv4 } from 'uuid'
import { omit } from 'decentraland-commons/dist/utils'
import {
  CollectionAttributes,
  FullCollection,
} from '../../src/Collection/Collection.types'
import { CollectionFragment } from '../../src/ethereum/api/fragments'
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
  third_party_id: null,
  reviewed_at: new Date(),
  created_at: new Date(),
  updated_at: new Date(),
}

export const collectionFragment: Omit<
  CollectionFragment,
  'reviewedAt' | 'updatedAt' | 'createdAt'
> & { reviewedAt: string | null; updatedAt: string; createdAt: string } = {
  id: 'string',
  creator: collectionAttributesMock.eth_address,
  owner: collectionAttributesMock.eth_address,
  name: collectionAttributesMock.name,
  isApproved: collectionAttributesMock.is_approved,
  minters: collectionAttributesMock.minters,
  managers: collectionAttributesMock.managers,
  reviewedAt: collectionAttributesMock.reviewed_at
    ? collectionAttributesMock.reviewed_at.toISOString()
    : null,
  updatedAt: collectionAttributesMock.updated_at.toISOString(),
  createdAt: collectionAttributesMock.created_at.toISOString(),
}

export type ResultCollection = Omit<
  FullCollection,
  'reviewed_at' | 'created_at' | 'updated_at' | 'urn_suffix'
> & {
  reviewed_at: string
  created_at: string
  updated_at: string
  urn_suffix: unknown
}

export function convertCollectionDatesToISO<
  T extends CollectionAttributes | FullCollection
>(
  collection: T
): Omit<T, 'reviewed_at' | 'created_at' | 'updated_at'> & {
  reviewed_at: string | null
  created_at: string
  updated_at: string
} {
  return {
    ...collection,
    reviewed_at: collection.reviewed_at
      ? collection.reviewed_at.toISOString()
      : null,
    created_at: collection.created_at.toISOString(),
    updated_at: collection.updated_at.toISOString(),
  }
}

export function toResultCollection(
  collection: CollectionAttributes,
  urn: string = ''
): ResultCollection {
  return omit(
    {
      ...convertCollectionDatesToISO(collection),
      urn,
    },
    ['urn_suffix']
  )
}

export const collectionDataMock =
  '0xd14fee77000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000001400000000000000000000000000000000000000000000000000000000000000180000000000000000000000000edae96f7739af8a7fb16e2a888c1e578e1328299000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000008eabf06f6cf667915bff30138be70543bce2901a0000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000001141206e657720636f6c6c656374696f6e7a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000e44434c2d414e57434c4c43544e5a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004368747470733a2f2f706565722e646563656e7472616c616e642e7a6f6e652f6c616d626461732f636f6c6c656374696f6e732f7374616e646172642f6572633732312f00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c00000000000000000000000000000000000000000000000000000000000000006756e6971756500000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000040313a773a536369466953756974205570706572426f64792046656d616c6520313a3a75707065725f626f64793a426173654d616c652c4261736546656d616c65'
