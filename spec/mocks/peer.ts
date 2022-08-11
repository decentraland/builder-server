import {
  Rarity,
  Wearable,
  WearableCategory,
  WearableRepresentation,
  I18N,
} from '@dcl/schemas'
import { dbCollectionMock } from './collections'
import {
  dbItemMock,
  itemFragmentMock,
  thirdPartyItemFragmentMock,
} from './items'

export const wearableMock: Wearable = {
  id: itemFragmentMock.urn,
  name: dbItemMock.name,
  description: dbItemMock.description,
  collectionAddress: dbCollectionMock.contract_address!,
  rarity: Rarity.COMMON,
  i18n: [{ code: 'en', text: dbItemMock.name }] as I18N[],
  image: '',
  thumbnail: '',
  metrics: dbItemMock.metrics,
  data: {
    category: WearableCategory.HAT,
    representations: [] as WearableRepresentation[],
    replaces: [] as WearableCategory[],
    hides: [] as WearableCategory[],
    tags: [],
  },
}

export const tpWearableMock: Wearable = {
  ...wearableMock,
  id: thirdPartyItemFragmentMock.urn,
  merkleProof: {
    proof: [],
    index: 0,
    hashingKeys: [
      'id',
      'name',
      'description',
      'data',
      'image',
      'thumbnail',
      'metrics',
      'contents',
    ],
    entityHash: 'someHash',
  },
}
