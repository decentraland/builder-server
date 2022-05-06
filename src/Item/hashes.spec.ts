import { Rarity, WearableCategory } from '@dcl/schemas'
import { dbItemMock, dbTPItemMock } from '../../spec/mocks/items'
import {
  dbCollectionMock,
  dbTPCollectionMock,
} from '../../spec/mocks/collections'
import { THUMBNAIL_PATH } from '../ethereum/api/peer'
import { CollectionAttributes } from '../Collection'
import { WearableBodyShape } from './wearable/types'
import { EmoteCategory } from './emote/types'
import { ItemAttributes, ItemType } from './Item.types'
import { calculateItemContentHash } from './hashes'

describe('when calculating the hashes of a standard wearable item', () => {
  let dbItem: ItemAttributes
  let dbCollection: CollectionAttributes

  beforeEach(() => {
    dbItem = {
      ...dbItemMock,
      blockchain_item_id: '0',
      name: 'F 3LAU Hat Blue',
      description: '',
      rarity: Rarity.UNIQUE,
      contents: {
        'thumbnail.png': 'QmeSfHFqSk73esyE5ZsW4yRqWsr5eJ8vXLx7v7L2dsXTmM',
        'male/F_3LAU_Hat_Blue.glb':
          'Qmf7dnGi5fyF9AwdJGzVnFCUUGBB8w2mW1v6AZAWh7rJVd',
        'image.png': 'QmXga5BnDE16XR6UH5Tgw3rDNLgA1RN8PkGZWpw7aQsUyN',
      },
      data: {
        replaces: [WearableCategory.EARRING],
        hides: [WearableCategory.EYEWEAR],
        tags: [],
        category: WearableCategory.EARRING,
        representations: [
          {
            bodyShapes: [WearableBodyShape.MALE],
            mainFile: 'male/F_3LAU_Hat_Blue.glb',
            contents: ['male/F_3LAU_Hat_Blue.glb'],
            overrideHides: [WearableCategory.EYEWEAR],
            overrideReplaces: [WearableCategory.EARRING],
          },
        ],
      },
      thumbnail: THUMBNAIL_PATH,
      metrics: {
        triangles: 468,
        materials: 2,
        textures: 2,
        meshes: 1,
        bodies: 2,
        entities: 1,
      },
    }
    dbCollection = {
      ...dbCollectionMock,
      contract_address: '0x6319d66715faf411f8c37a2f5858e0bce90da5ae',
    }
  })

  it("should return the hash of the item's entity", () => {
    return expect(
      calculateItemContentHash(dbItem, dbCollection)
    ).resolves.toEqual(
      'bafkreihtcjnfcahy3nomnhxiuyjyzj2fxzy3eab7ctmxl237nf2vsoqkmu'
    )
  })
})

describe('when calculating the hashes of a standard emote item', () => {
  let dbItem: ItemAttributes
  let dbCollection: CollectionAttributes

  beforeEach(() => {
    dbItem = {
      ...dbItemMock,
      type: ItemType.EMOTE,
      blockchain_item_id: '0',
      name: 'F 3LAU Hat Blue',
      description: '',
      rarity: Rarity.UNIQUE,
      contents: {
        'thumbnail.png': 'QmeSfHFqSk73esyE5ZsW4yRqWsr5eJ8vXLx7v7L2dsXTmM',
        'male/F_3LAU_Hat_Blue.glb':
          'Qmf7dnGi5fyF9AwdJGzVnFCUUGBB8w2mW1v6AZAWh7rJVd',
        'image.png': 'QmXga5BnDE16XR6UH5Tgw3rDNLgA1RN8PkGZWpw7aQsUyN',
      },
      data: {
        tags: [],
        category: EmoteCategory.LOOP as any,
        representations: [
          {
            bodyShapes: [WearableBodyShape.MALE],
            mainFile: 'male/F_3LAU_Hat_Blue.glb',
            contents: ['male/F_3LAU_Hat_Blue.glb'],
          } as any,
        ],
      } as any,
      thumbnail: THUMBNAIL_PATH,
      metrics: {
        triangles: 468,
        materials: 2,
        textures: 2,
        meshes: 1,
        bodies: 2,
        entities: 1,
      },
    }
    dbCollection = {
      ...dbCollectionMock,
      contract_address: '0x6319d66715faf411f8c37a2f5858e0bce90da5ae',
    }
  })

  it("should return the hash of the item's entity", () => {
    return expect(
      calculateItemContentHash(dbItem, dbCollection)
    ).resolves.toEqual(
      'bafkreiarnvngt5woehoequocda3o3jmyhq7zkiyafqg4vdrkfvaszaslza'
    )
  })
})

describe('when calculating the hashes of a TP item', () => {
  let dbItem: ItemAttributes
  let dbCollection: CollectionAttributes

  beforeEach(() => {
    dbItem = {
      ...dbTPItemMock,
      name: 'F 3LAU Hat Blue',
      description: '',
      contents: {
        'thumbnail.png': 'QmeSfHFqSk73esyE5ZsW4yRqWsr5eJ8vXLx7v7L2dsXTmM',
        'male/F_3LAU_Hat_Blue.glb':
          'Qmf7dnGi5fyF9AwdJGzVnFCUUGBB8w2mW1v6AZAWh7rJVd',
        'image.png': 'QmXga5BnDE16XR6UH5Tgw3rDNLgA1RN8PkGZWpw7aQsUyN',
      },
      data: {
        replaces: [WearableCategory.EARRING],
        hides: [WearableCategory.EYEWEAR],
        tags: [],
        category: WearableCategory.EARRING,
        representations: [
          {
            bodyShapes: [WearableBodyShape.MALE],
            mainFile: 'male/F_3LAU_Hat_Blue.glb',
            contents: ['male/F_3LAU_Hat_Blue.glb'],
            overrideHides: [WearableCategory.EYEWEAR],
            overrideReplaces: [WearableCategory.EARRING],
          },
        ],
      },
      thumbnail: THUMBNAIL_PATH,
      metrics: {
        triangles: 468,
        materials: 2,
        textures: 2,
        meshes: 1,
        bodies: 2,
        entities: 1,
      },
    }
    dbCollection = {
      ...dbTPCollectionMock,
    }
  })

  it("should return the hash of the item's entity", () => {
    return expect(
      calculateItemContentHash(dbItem, dbCollection)
    ).resolves.toEqual(
      '0a00e995e0df3736a9a7aa5b7607861f6426239b4acc23f60da69fa3637ae4b8'
    )
  })
})
