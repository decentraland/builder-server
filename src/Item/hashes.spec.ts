import { dbItemMock } from '../../spec/mocks/items'
import { dbCollectionMock } from '../../spec/mocks/collections'
import { THUMBNAIL_PATH } from '../ethereum/api/peer'
import { CollectionAttributes } from '../Collection'
import { WearableBodyShape, WearableCategory } from './wearable/types'
import { ItemAttributes, ItemRarity } from './Item.types'
import { calculateItemContentHash } from './hashes'

describe('when calculating the hashes of an item', () => {
  let dbItem: ItemAttributes
  let dbCollection: CollectionAttributes

  beforeEach(() => {
    dbItem = {
      ...dbItemMock,
      blockchain_item_id: '0',
      name: 'F 3LAU Hat Blue',
      description: '',
      rarity: ItemRarity.UNIQUE,
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
      'bafkreif74bjg675rbb4l4ksz3fbqwul7anbcps6qgw5caoyzmncdiqipm4'
    )
  })
})
