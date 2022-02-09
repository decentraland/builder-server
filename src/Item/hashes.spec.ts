import { ItemAttributes, ItemRarity } from './Item.types'
import { calculateItemContentHash } from './hashes'
import { dbItemMock } from '../../spec/mocks/items'
import { WearableBodyShape, WearableCategory } from './wearable/types'

describe('when calculating the hashes of an item', () => {
  let dbItem: ItemAttributes
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
      thumbnail: 'thumbnail.png',
      metrics: {
        triangles: 468,
        materials: 2,
        textures: 2,
        meshes: 1,
        bodies: 2,
        entities: 1,
      },
    }
  })

  it("should return the hash of the item's entity", () => {
    return expect(
      calculateItemContentHash(
        dbItem,
        '0x6319d66715faf411f8c37a2f5858e0bce90da5ae'
      )
    ).resolves.toEqual('QmehW1ccHcvdKp8NNhrr6PdxEDHGYa9j6xmu9Bojg8jcjN')
  })
})

// Content [
//   {
//     file: 'thumbnail.png',
//     hash: 'QmeSfHFqSk73esyE5ZsW4yRqWsr5eJ8vXLx7v7L2dsXTmM'
//   },
//   {
//     file: 'male/F_3LAU_Hat_Blue.glb',
//     hash: 'Qmf7dnGi5fyF9AwdJGzVnFCUUGBB8w2mW1v6AZAWh7rJVd'
//   },
//   {
//     file: 'image.png',
//     hash: 'QmXga5BnDE16XR6UH5Tgw3rDNLgA1RN8PkGZWpw7aQsUyN'
//   }
// ]

// {
//   "thumbnail.png": "QmeSfHFqSk73esyE5ZsW4yRqWsr5eJ8vXLx7v7L2dsXTmM",
//   "male/F_3LAU_Hat_Blue.glb": "Qmf7dnGi5fyF9AwdJGzVnFCUUGBB8w2mW1v6AZAWh7rJVd",
//   "image.png": "QmXga5BnDE16XR6UH5Tgw3rDNLgA1RN8PkGZWpw7aQsUyN"
// }

// {
//   "id": "urn:decentraland:mumbai:collections-v2:0x6319d66715faf411f8c37a2f5858e0bce90da5ae:0",
//   "name": "F 3LAU Hat Blue",
//   "description": "",
//   "collectionAddress": "0x6319d66715faf411f8c37a2f5858e0bce90da5ae",
//   "rarity": "unique",
//   "i18n": [
//       {
//           "code": "en",
//           "text": "F 3LAU Hat Blue"
//       }
//   ],
//   "data": {
//       "replaces": [
//           "earring"
//       ],
//       "hides": [
//           "eyewear"
//       ],
//       "tags": [],
//       "category": "earring",
//       "representations": [
//           {
//               "bodyShapes": [
//                   "urn:decentraland:off-chain:base-avatars:BaseMale"
//               ],
//               "mainFile": "male/F_3LAU_Hat_Blue.glb",
//               "contents": [
//                   "male/F_3LAU_Hat_Blue.glb"
//               ],
//               "overrideHides": [
//                   "eyewear"
//               ],
//               "overrideReplaces": [
//                   "earring"
//               ]
//           }
//       ]
//   },
//   "image": "image.png",
//   "thumbnail": "thumbnail.png",
//   "metrics": {
//       "triangles": 468,
//       "materials": 2,
//       "textures": 2,
//       "meshes": 1,
//       "bodies": 2,
//       "entities": 1
//   }
// }

// Metadata {
//   id: 'urn:decentraland:ropsten:collections-v2:0x6319d66715faf411f8c37a2f5858e0bce90da5ae:0',
//   name: 'F 3LAU Hat Blue',
//   description: '',
//   collectionAddress: '0x6319d66715faf411f8c37a2f5858e0bce90da5ae',
//   rarity: 'unique',
//   i18n: [ { code: 'en', text: 'F 3LAU Hat Blue' } ],
//   data: {
//     replaces: [ 'earring' ],
//     hides: [ 'eyewear' ],
//     tags: [],
//     category: 'earring',
//     representations: [ [Object] ]
//   },
//   image: 'image.png',
//   thumbnail: 'thumbnail.png',
//   metrics: {
//     triangles: 468,
//     materials: 2,
//     textures: 2,
//     meshes: 1,
//     bodies: 2,
//     entities: 1
//   }
// }
