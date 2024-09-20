import {
  LinkedContract,
  ThirdPartyFragment,
  ThirdPartyMetadataType,
} from '../ethereum/api/fragments'
import { thirdPartyMock } from '../../spec/mocks/collections'
import {
  convertThirdPartyMetadataToRawMetadata,
  convertVirtualThirdPartyToThirdParty,
  parseRawMetadata,
  toThirdParty,
} from './utils'
import { ThirdParty } from './ThirdParty.types'
import { VirtualThirdPartyAttributes } from './VirtualThirdParty.types'

describe('when converting a third party fragment into a third party', () => {
  describe('when a complete fragment is supplied', () => {
    let fragment: ThirdPartyFragment

    beforeEach(() => {
      fragment = {
        id: 'some:id',
        root: 'aRoot',
        managers: ['0x1', '0x2'],
        maxItems: '1',
        isApproved: true,
        metadata: {
          type: ThirdPartyMetadataType.THIRD_PARTY_V1,
          thirdParty: {
            name: 'a name',
            description: 'some description',
            contracts: [{ network: 'amoy', address: '0x0' }],
          },
        },
      }
    })

    it('should take a third party fragment and parse it to conform to the ThirdParty type', () => {
      const { name, description } = fragment.metadata.thirdParty!

      const thirdParty: ThirdParty = {
        id: fragment.id,
        root: fragment.root,
        managers: fragment.managers,
        maxItems: fragment.maxItems,
        isApproved: true,
        name: name,
        description: description,
        contracts: [{ network: 'amoy', address: '0x0' }],
        published: true,
      }
      expect(toThirdParty(fragment)).toEqual(thirdParty)
    })
  })

  describe('when the third party metadata is null', () => {
    let fragment: ThirdPartyFragment

    beforeEach(() => {
      fragment = {
        id: 'some:other:id',
        root: 'aRoot',
        managers: ['0x2'],
        maxItems: '2',
        isApproved: true,
        metadata: {
          type: ThirdPartyMetadataType.THIRD_PARTY_V1,
          thirdParty: null,
        },
      }
    })

    it('should add empty strings as name and description', () => {
      const thirdParty: ThirdParty = {
        id: fragment.id,
        root: fragment.root,
        managers: fragment.managers,
        maxItems: fragment.maxItems,
        isApproved: fragment.isApproved,
        name: '',
        description: '',
        contracts: [],
        published: true,
      }
      expect(toThirdParty(fragment)).toEqual(thirdParty)
    })
  })
})

describe('when converting a virtual third party into a third party', () => {
  let virtualThirdParty: VirtualThirdPartyAttributes
  let thirdParty: ThirdParty

  beforeEach(() => {
    thirdParty = { ...thirdPartyMock }
    virtualThirdParty = {
      id: thirdParty.id,
      managers: thirdParty.managers,
      raw_metadata: convertThirdPartyMetadataToRawMetadata(
        thirdParty.name,
        thirdParty.description,
        thirdParty.contracts
      ),
      created_at: new Date(),
      updated_at: new Date(),
    }
  })

  it('should return a third party', () => {
    expect(convertVirtualThirdPartyToThirdParty(virtualThirdParty)).toEqual({
      ...thirdParty,
      root: '',
      isApproved: false,
      published: false,
      maxItems: '0',
    })
  })
})

describe('when parsing raw metadata', () => {
  let rawMetadata: string
  beforeEach(() => {
    rawMetadata = 'tp:1:'
  })

  describe('when the raw metadata has contracts', () => {
    beforeEach(() => {
      rawMetadata = 'tp:1:a name:a description:amoy-0x0'
    })

    it('should return the name, description and contracts', () => {
      expect(parseRawMetadata(rawMetadata)).toEqual({
        name: 'a name',
        description: 'a description',
        contracts: [{ network: 'amoy', address: '0x0' }],
      })
    })
  })

  describe('when the raw metadata does not have contracts', () => {
    beforeEach(() => {
      rawMetadata = 'tp:1:a name:a description:'
    })

    it('should return the name and description', () => {
      expect(parseRawMetadata(rawMetadata)).toEqual({
        name: 'a name',
        description: 'a description',
        contracts: [],
      })
    })
  })

  describe('when the raw metadata is not correctly built', () => {
    it('should return default metadata', () => {
      expect(parseRawMetadata(rawMetadata)).toEqual({
        name: '',
        description: '',
        contracts: [],
      })
    })
  })
})

describe('when converting third party metadata to raw metadata', () => {
  let name: string
  let description: string
  let contracts: LinkedContract[]

  beforeEach(() => {
    name = 'a name'
    description = 'a description'
  })

  describe('and the metadata has contracts', () => {
    beforeEach(() => {
      contracts = [{ network: 'amoy', address: '0x0' }]
    })

    it('should return the raw metadata with the contract', () => {
      expect(
        convertThirdPartyMetadataToRawMetadata(name, description, contracts)
      ).toEqual('tp:1:a name:a description:amoy-0x0')
    })
  })

  describe('and the metadata does not have contracts', () => {
    beforeEach(() => {
      contracts = []
    })

    it('should return the raw metadata without the contract', () => {
      expect(
        convertThirdPartyMetadataToRawMetadata(name, description, contracts)
      ).toEqual('tp:1:a name:a description')
    })
  })
})
