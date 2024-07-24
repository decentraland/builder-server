import {
  BodyShape,
  EmoteCategory,
  MappingType,
  Rarity,
  WearableCategory,
} from '@dcl/schemas'
import { dbItemMock, dbTPItemMock } from '../../spec/mocks/items'
import {
  dbCollectionMock,
  dbTPCollectionMock,
} from '../../spec/mocks/collections'
import { THUMBNAIL_PATH } from '../ethereum/api/peer'
import { CollectionAttributes } from '../Collection'
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
            bodyShapes: [BodyShape.MALE],
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
      'bafkreigblh3xd4r57xvpvokhyhzydmmb5wt6ri7tyf25hpm7flknjkyqma'
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
        category: EmoteCategory.DANCE as any,
        representations: [
          {
            bodyShapes: [BodyShape.MALE],
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
      'bafkreie2zynwvkky5jxvnyhc2rhhzyyqwdrpmoetcxfaka4zc533adqsoq'
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
            bodyShapes: [BodyShape.MALE],
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

  describe('and the item is a third party item', () => {
    beforeEach(() => {
      dbCollection.third_party_id =
        'urn:decentraland:amoy:collections-thirdparty:dcl-tests'
    })

    describe('and the item has no mappings', () => {
      beforeEach(() => {
        dbItem.mappings = null
      })

      it("should return the hash of the item's entity", () => {
        return expect(
          calculateItemContentHash(dbItem, dbCollection)
        ).resolves.toEqual(
          'fa107ac8f8a5444454532548b2d906569a275573a7158a6a170f0592f9368313'
        )
      })
    })

    describe('and the item has mappings', () => {
      beforeEach(() => {
        dbItem.mappings = {
          amoy: {
            '0x74c78f5A4ab22F01d5fd08455cf0Ff5C3367535C': [
              {
                type: MappingType.ANY,
              },
            ],
          },
        }
      })

      it("should return the hash of the item's entity", () => {
        return expect(
          calculateItemContentHash(dbItem, dbCollection)
        ).resolves.toEqual(
          '80388e7d6601cf23253b74891e7bfe377bc75d5b7e58b23d6e42e5ab65a54daa'
        )
      })
    })
  })
})

describe('when calculating the hashes of a standard smart wearable item', () => {
  let dbItem: ItemAttributes
  let dbCollection: CollectionAttributes

  beforeEach(() => {
    dbItem = {
      ...dbItemMock,
      blockchain_item_id: '0',
      name: 'Portable Experience',
      description: '',
      rarity: Rarity.UNIQUE,
      contents: {
        'female/AvatarWearables_TX.png':
          'bafkreie2zkxkaboe6lo2yuafimiu4rzdlyuw4cvyaaocx4szwyranfpoaa',
        'female/bin/game.js':
          'bafkreibtkosbdslppwl5l55rrm7ke3fysrluwgb563wvwjtaeog3delpx4',
        'female/bin/game.js.lib':
          'bafkreidfrw6am64cerdjmhzisr2svicl5mv4zowuqbvwj24olxc7gzaaae',
        'female/glasses.glb':
          'bafkreiejnil6fhcb6s2pjbuvbwb6s7bo4flz4o4wosjjqrtd4gjuyht45u',
        'image.png':
          'bafkreicji7bbqnptmzlmkevtvnazvpbd5bh2si7ibtnrlovsfnmqnppkxq',
        'male/AvatarWearables_TX.png':
          'bafkreie2zkxkaboe6lo2yuafimiu4rzdlyuw4cvyaaocx4szwyranfpoaa',
        'male/bin/game.js':
          'bafkreibtkosbdslppwl5l55rrm7ke3fysrluwgb563wvwjtaeog3delpx4',
        'male/bin/game.js.lib':
          'bafkreidfrw6am64cerdjmhzisr2svicl5mv4zowuqbvwj24olxc7gzaaae',
        'male/glasses.glb':
          'bafkreiejnil6fhcb6s2pjbuvbwb6s7bo4flz4o4wosjjqrtd4gjuyht45u',
        'scene.json':
          'bafkreidtufkdglwrwjjnrvpsjvfhytopcqldwtqrb4dyo3o3tletxydnpq',
        'thumbnail.png':
          'bafkreidvmdpycofi6j6xedlkib6ka4yrt5lrtk3b5g5lesuvmlraf2677m',
        'video.mp4':
          'bafkreihkmqpjvdbqktgzfyevw3eod3bjot53wasx4bpfgbyoeyv6uxjzr4',
      },
      data: {
        replaces: [],
        hides: [],
        tags: [],
        category: WearableCategory.EYEWEAR,
        representations: [
          {
            bodyShapes: [BodyShape.MALE],
            mainFile: 'male/glasses.glb',
            contents: [
              'male/AvatarWearables_TX.png',
              'male/glasses.glb',
              'male/bin/game.js',
              'male/bin/game.js.lib',
            ],
            overrideHides: [],
            overrideReplaces: [],
          },
          {
            bodyShapes: [BodyShape.FEMALE],
            mainFile: 'female/glasses.glb',
            contents: [
              'female/AvatarWearables_TX.png',
              'female/glasses.glb',
              'female/bin/game.js',
              'female/bin/game.js.lib',
            ],
            overrideHides: [],
            overrideReplaces: [],
          },
        ],
        requiredPermissions: ['USE_WEB3_API', 'OPEN_EXTERNAL_LINK'],
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
      video: 'video.mp4',
    }
    dbCollection = {
      ...dbCollectionMock,
      contract_address: '0x6319d66715faf411f8c37a2f5858e0bce90da5ae',
    }
  })

  it("should return the hash of the item's entity, ignoring the contents video file", () => {
    return expect(
      calculateItemContentHash(dbItem, dbCollection)
    ).resolves.toEqual(
      'bafkreidwpzttiygmitkrzgubk3xaiashgvyuqf2u2p47fb7w666rggutzy'
    )
  })
})
