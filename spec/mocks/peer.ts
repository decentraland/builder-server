import { ItemRarity } from '../../src/Item'
import { dbCollectionMock } from './collections'
import {
  dbItemMock,
  itemFragmentMock,
  thirdPartyItemFragmentMock,
} from './items'

export const wearableMock = {
  id: itemFragmentMock.urn,
  name: dbItemMock.name,
  description: dbItemMock.description,
  collectionAddress: dbCollectionMock.contract_address!,
  rarity: ItemRarity.COMMON,
  image: '',
  thumbnail: '',
  metrics: dbItemMock.metrics,
  contents: {},
  data: {
    representations: [],
    replaces: [],
    hides: [],
    tags: [],
  },
  createdAt: dbItemMock.created_at.getTime(),
  updatedAt: dbItemMock.updated_at.getTime(),
}

export const tpWearableMock = {
  ...wearableMock,
  id: thirdPartyItemFragmentMock.urn,
  collectionAddress: '',
}
