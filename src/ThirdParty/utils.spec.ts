import {
  ThirdPartyFragment,
  ThirdPartyMetadataType,
} from '../ethereum/api/fragments'
import { toThirdParty } from './utils'
import { ThirdParty } from './ThirdParty.types'

describe('toThirdParty', () => {
  describe('when a complete fragment is supplied', () => {
    let fragment: ThirdPartyFragment

    beforeEach(() => {
      fragment = {
        id: 'some:id',
        managers: ['0x1', '0x2'],
        maxItems: 1,
        totalItems: 1,
        metadata: {
          type: ThirdPartyMetadataType.THIRD_PARTY_V1,
          thirdParty: {
            name: 'a name',
            description: 'some description',
          },
        },
      }
    })

    it('should take a third party fragment and parse it to conform to the ThirdParty type', () => {
      const { name, description } = fragment.metadata.thirdParty!

      const thirdParty: ThirdParty = {
        id: fragment.id,
        managers: fragment.managers,
        maxItems: fragment.maxItems,
        totalItems: fragment.totalItems,
        name: name,
        description: description,
      }
      expect(toThirdParty(fragment)).toEqual(thirdParty)
    })
  })

  describe('when the third party metadata is null', () => {
    let fragment: ThirdPartyFragment

    beforeEach(() => {
      fragment = {
        id: 'some:other:id',
        managers: ['0x2'],
        maxItems: 2,
        totalItems: 1,
        metadata: {
          type: ThirdPartyMetadataType.THIRD_PARTY_V1,
          thirdParty: null,
        },
      }
    })

    it('should add empty strings as name and description', () => {
      const thirdParty: ThirdParty = {
        id: fragment.id,
        managers: fragment.managers,
        maxItems: fragment.maxItems,
        totalItems: fragment.totalItems,
        name: '',
        description: '',
      }
      expect(toThirdParty(fragment)).toEqual(thirdParty)
    })
  })
})
