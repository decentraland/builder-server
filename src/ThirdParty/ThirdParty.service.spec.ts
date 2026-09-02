import { thirdPartyFragmentMock } from '../../spec/mocks/collections'
import { ThirdPartyFragment } from '../ethereum/api/fragments'
import { thirdPartyAPI } from '../ethereum/api/thirdParty'
import {
  NonExistentThirdPartyError,
  OnlyDeletableIfOnGraphError,
  UnauthorizedThirdPartyManagerError,
} from './ThirdParty.errors'
import { ThirdPartyService } from './ThirdParty.service'
import {
  convertThirdPartyMetadataToRawMetadata,
  convertVirtualThirdPartyToThirdParty,
  parseRawMetadata,
  toThirdParty,
} from './utils'
import { VirtualThirdParty } from './VirtualThirdParty.model'
import { VirtualThirdPartyAttributes } from './VirtualThirdParty.types'

jest.mock('../ethereum/api/thirdParty')
jest.mock('./VirtualThirdParty.model')

const thirdPartyAPIMock = thirdPartyAPI as jest.Mocked<typeof thirdPartyAPI>
const VirtualThirdPartyMock = VirtualThirdParty as jest.Mocked<
  typeof VirtualThirdParty
>
let thirdPartyFragment: ThirdPartyFragment
let virtualThirdParty: VirtualThirdPartyAttributes

beforeEach(() => {
  thirdPartyFragment = {
    ...thirdPartyFragmentMock,
  }
  virtualThirdParty = {
    id: thirdPartyFragment.id,
    managers: thirdPartyFragment.managers,
    isProgrammatic: false,
    raw_metadata: convertThirdPartyMetadataToRawMetadata(
      'name',
      'description',
      []
    ),
    created_at: new Date(),
    updated_at: new Date(),
  }
})

describe('when checking if an address is a manager', () => {
  let address: string
  beforeEach(() => {
    address = '0x01'
  })

  describe('and the third party exists in the graph', () => {
    beforeEach(() => {
      thirdPartyAPIMock.fetchThirdParty.mockResolvedValue(thirdPartyFragment)
    })

    describe('and the user is a manger of the third party', () => {
      beforeEach(() => {
        thirdPartyFragment.managers.push(address)
      })

      it('should resolve to true', () => {
        return expect(
          ThirdPartyService.isManager(thirdPartyFragment.id, address)
        ).resolves.toBe(true)
      })
    })

    describe('and the user is not a manager of the third party', () => {
      beforeEach(() => {
        thirdPartyFragment.managers = thirdPartyFragment.managers.filter(
          (manager) => manager !== address
        )
      })

      it('should resolve to false', () => {
        return expect(
          ThirdPartyService.isManager(thirdPartyFragment.id, address)
        ).resolves.toBe(false)
      })
    })
  })

  describe('and the third party does not exist in the graph', () => {
    beforeEach(() => {
      thirdPartyAPIMock.fetchThirdParty.mockResolvedValueOnce(undefined)
    })

    describe('and the third party exists as a virtual third party', () => {
      beforeEach(() => {
        VirtualThirdPartyMock.findOne.mockResolvedValueOnce(virtualThirdParty)
      })

      describe('and the user is a manager of the virtual third party', () => {
        beforeEach(() => {
          virtualThirdParty.managers.push(address)
        })

        it('should resolve to true', () => {
          return expect(
            ThirdPartyService.isManager(thirdPartyFragment.id, address)
          ).resolves.toBe(true)
        })
      })

      describe('and the user is not a manager of the virtual third party', () => {
        beforeEach(() => {
          virtualThirdParty.managers = virtualThirdParty.managers.filter(
            (manager) => manager !== address
          )
        })

        it('should resolve to false', () => {
          return expect(
            ThirdPartyService.isManager(thirdPartyFragment.id, address)
          ).resolves.toBe(false)
        })
      })
    })

    describe('and the third party does not exist as a virtual third party', () => {
      beforeEach(() => {
        VirtualThirdPartyMock.findOne.mockResolvedValueOnce(undefined)
      })

      it('should resolve to false', () => {
        return expect(
          ThirdPartyService.isManager(thirdPartyFragment.id, address)
        ).resolves.toBe(false)
      })
    })
  })

  describe('and a virtual third party exists', () => {
    let virtualManager: string
    let indexedOnlyWallet: string

    beforeEach(() => {
      virtualManager = '0xaaa'
      indexedOnlyWallet = '0xbbb'
      virtualThirdParty.managers = [virtualManager]
      VirtualThirdPartyMock.findOne.mockResolvedValue(virtualThirdParty)
    })

    describe('and the indexed record is approved', () => {
      beforeEach(() => {
        thirdPartyFragment.isApproved = true
        thirdPartyFragment.managers = [indexedOnlyWallet]
        thirdPartyAPIMock.fetchThirdParty.mockResolvedValue(thirdPartyFragment)
      })

      it('should resolve to true for a wallet listed by the indexed record', () => {
        return expect(
          ThirdPartyService.isManager(thirdPartyFragment.id, indexedOnlyWallet)
        ).resolves.toBe(true)
      })

      it('should resolve to false for a wallet listed only by the virtual record', () => {
        return expect(
          ThirdPartyService.isManager(thirdPartyFragment.id, virtualManager)
        ).resolves.toBe(false)
      })
    })

    describe('and the indexed record is not yet approved', () => {
      beforeEach(() => {
        thirdPartyFragment.isApproved = false
        thirdPartyFragment.managers = [indexedOnlyWallet]
        thirdPartyAPIMock.fetchThirdParty.mockResolvedValue(thirdPartyFragment)
      })

      it('should resolve to true for a wallet listed by the virtual record', () => {
        return expect(
          ThirdPartyService.isManager(thirdPartyFragment.id, virtualManager)
        ).resolves.toBe(true)
      })

      it('should resolve to false for a wallet present only in the indexed record', () => {
        return expect(
          ThirdPartyService.isManager(thirdPartyFragment.id, indexedOnlyWallet)
        ).resolves.toBe(false)
      })
    })
  })
})

describe('when creating a virtual third party', () => {
  describe('when the creation fails', () => {
    beforeEach(() => {
      VirtualThirdPartyMock.create.mockRejectedValue(new Error())
    })

    it('should propagate the error', () => {
      return expect(
        ThirdPartyService.createVirtualThirdParty(
          virtualThirdParty.id,
          virtualThirdParty.managers,
          parseRawMetadata(virtualThirdParty.raw_metadata)
        )
      ).rejects.toThrow()
    })
  })

  describe('when the creation succeeds', () => {
    beforeEach(() => {
      VirtualThirdPartyMock.create.mockResolvedValue(virtualThirdParty)
    })

    it('should create the virtual third party and resolve a third party', () => {
      return expect(
        ThirdPartyService.createVirtualThirdParty(
          virtualThirdParty.id,
          virtualThirdParty.managers,
          parseRawMetadata(virtualThirdParty.raw_metadata)
        )
      ).resolves.toEqual(
        convertVirtualThirdPartyToThirdParty(virtualThirdParty)
      )
    })
  })
})

describe('when getting a third party', () => {
  describe('and the third party is not found in the graph', () => {
    beforeEach(() => {
      thirdPartyAPIMock.fetchThirdParty.mockResolvedValue(undefined)
    })

    describe('and the third party is not found as a virtual third party', () => {
      beforeEach(() => {
        VirtualThirdPartyMock.findOne.mockResolvedValue(undefined)
      })

      it('should reject with the NonExistentThirdPartyError error', () => {
        return expect(
          ThirdPartyService.getThirdParty(thirdPartyFragment.id)
        ).rejects.toThrow(NonExistentThirdPartyError)
      })
    })

    describe('and the third party is found as a virtual third party', () => {
      beforeEach(() => {
        VirtualThirdPartyMock.findOne.mockResolvedValue(virtualThirdParty)
      })

      it('should resolve the virtual third party', () => {
        return expect(
          ThirdPartyService.getThirdParty(thirdPartyFragment.id)
        ).resolves.toEqual(
          convertVirtualThirdPartyToThirdParty(virtualThirdParty)
        )
      })
    })
  })

  describe('and the third party is found in the graph', () => {
    beforeEach(() => {
      thirdPartyAPIMock.fetchThirdParty.mockResolvedValue(thirdPartyFragment)
    })

    it('should return the third party', () => {
      return expect(
        ThirdPartyService.getThirdParty(thirdPartyFragment.id)
      ).resolves.toEqual(toThirdParty(thirdPartyFragment))
    })
  })
})

describe('when removing a virtual third party', () => {
  describe('and the virtual third party does not exist', () => {
    beforeEach(() => {
      VirtualThirdPartyMock.findOne.mockResolvedValue(undefined)
    })

    it('should reject with the NonExistentThirdPartyError error', () => {
      return expect(
        ThirdPartyService.removeVirtualThirdParty(
          virtualThirdParty.id,
          virtualThirdParty.managers[0]
        )
      ).rejects.toThrow(NonExistentThirdPartyError)
    })
  })

  describe('and the virtual third party exists', () => {
    beforeEach(() => {
      VirtualThirdPartyMock.findOne.mockResolvedValue(virtualThirdParty)
    })

    describe('and the user is not a manager of the virtual third party', () => {
      beforeEach(() => {
        virtualThirdParty.managers = []
      })

      it('should reject with the UnauthorizedThirdPartyManagerError error', () => {
        return expect(
          ThirdPartyService.removeVirtualThirdParty(
            virtualThirdParty.id,
            virtualThirdParty.managers[0]
          )
        ).rejects.toThrow(UnauthorizedThirdPartyManagerError)
      })
    })

    describe('and the user is a manager of the virtual third party', () => {
      describe('and there is no indexed record', () => {
        beforeEach(() => {
          thirdPartyAPIMock.fetchThirdParty.mockResolvedValue(undefined)
        })

        it('should reject with the OnlyDeletableIfOnGraphError error', () => {
          return expect(
            ThirdPartyService.removeVirtualThirdParty(
              virtualThirdParty.id,
              virtualThirdParty.managers[0]
            )
          ).rejects.toThrow(OnlyDeletableIfOnGraphError)
        })
      })

      describe('and an indexed record exists', () => {
        beforeEach(() => {
          thirdPartyAPIMock.fetchThirdParty.mockResolvedValue(
            thirdPartyFragment
          )
        })

        it('should delete the virtual third party and resolve', () => {
          return expect(
            ThirdPartyService.removeVirtualThirdParty(
              virtualThirdParty.id,
              virtualThirdParty.managers[0]
            )
          ).resolves.toBeUndefined()
        })

        it('should authorize the manager regardless of address casing and resolve', () => {
          virtualThirdParty.managers = [
            '0xAbCdEf0000000000000000000000000000000001',
          ]
          return expect(
            ThirdPartyService.removeVirtualThirdParty(
              virtualThirdParty.id,
              '0xabcdef0000000000000000000000000000000001'
            )
          ).resolves.toBeUndefined()
        })
      })
    })
  })
})

describe('when getting all third parties of a manager', () => {
  let address: string

  beforeEach(() => {
    address = '0x01'
    VirtualThirdPartyMock.findByIds.mockResolvedValue(new Map())
  })

  describe('and there are no third parties', () => {
    beforeEach(() => {
      VirtualThirdPartyMock.findByManager.mockResolvedValue([])
      thirdPartyAPIMock.fetchThirdPartiesByManager.mockResolvedValue([])
    })

    it('should resolve into an empty array', () => {
      return expect(
        ThirdPartyService.getThirdParties(address)
      ).resolves.toEqual([])
    })
  })

  describe('and there are only virtual third parties', () => {
    beforeEach(() => {
      VirtualThirdPartyMock.findByManager.mockResolvedValue([virtualThirdParty])
      thirdPartyAPIMock.fetchThirdPartiesByManager.mockResolvedValue([])
    })

    it('should return the virtual third parties', () => {
      return expect(
        ThirdPartyService.getThirdParties(address)
      ).resolves.toEqual([
        convertVirtualThirdPartyToThirdParty(virtualThirdParty),
      ])
    })
  })

  describe('and there are only graph third parties', () => {
    beforeEach(() => {
      VirtualThirdPartyMock.findByManager.mockResolvedValue([])
      thirdPartyAPIMock.fetchThirdPartiesByManager.mockResolvedValue([
        thirdPartyFragment,
      ])
    })

    it('should resolve the graph third parties', () => {
      return expect(
        ThirdPartyService.getThirdParties(address)
      ).resolves.toEqual([toThirdParty(thirdPartyFragment)])
    })
  })

  describe('and an unapproved indexed record has a virtual record that does not list the querying manager', () => {
    beforeEach(() => {
      thirdPartyFragment.isApproved = false
      virtualThirdParty.managers = ['0xother']
      VirtualThirdPartyMock.findByManager.mockResolvedValue([])
      VirtualThirdPartyMock.findByIds.mockResolvedValue(
        new Map([[thirdPartyFragment.id, virtualThirdParty]])
      )
      thirdPartyAPIMock.fetchThirdPartiesByManager.mockResolvedValue([
        thirdPartyFragment,
      ])
    })

    it('should exclude the indexed record from the result', () => {
      return expect(
        ThirdPartyService.getThirdParties(address)
      ).resolves.toEqual([])
    })
  })

  describe('and there are both virtual and graph third parties', () => {
    describe('and some of them have the same id', () => {
      beforeEach(() => {
        VirtualThirdPartyMock.findByManager.mockResolvedValue([
          virtualThirdParty,
        ])
        thirdPartyAPIMock.fetchThirdPartiesByManager.mockResolvedValue([
          thirdPartyFragment,
        ])
      })

      it('should resolve only the third parties from the graph', () => {
        return expect(
          ThirdPartyService.getThirdParties(address)
        ).resolves.toEqual([toThirdParty(thirdPartyFragment)])
      })
    })

    describe("and they don't have the same id", () => {
      beforeEach(() => {
        virtualThirdParty.id = 'someDifferentId'
        VirtualThirdPartyMock.findByManager.mockResolvedValue([
          virtualThirdParty,
        ])
        thirdPartyAPIMock.fetchThirdPartiesByManager.mockResolvedValue([
          thirdPartyFragment,
        ])
      })

      it('should resolve to all third parties', () => {
        return expect(
          ThirdPartyService.getThirdParties(address)
        ).resolves.toEqual([
          toThirdParty(thirdPartyFragment),
          convertVirtualThirdPartyToThirdParty(virtualThirdParty),
        ])
      })
    })
  })
})

describe('when updating a virtual third party', () => {
  describe('and the virtual third party does not exist', () => {
    beforeEach(() => {
      VirtualThirdPartyMock.findOne.mockResolvedValue(undefined)
    })

    it('should reject with the NonExistentThirdPartyError error', () => {
      return expect(
        ThirdPartyService.updateVirtualThirdParty(virtualThirdParty.id, '0x2', {
          isProgrammatic: true,
        })
      ).rejects.toThrow(NonExistentThirdPartyError)
    })
  })

  describe('and the virtual third party exists', () => {
    beforeEach(() => {
      VirtualThirdPartyMock.findOne.mockResolvedValue(virtualThirdParty)
    })

    describe('and the user is not a manager of the virtual third party', () => {
      beforeEach(() => {
        virtualThirdParty.managers = []
      })

      it('should reject with the UnauthorizedThirdPartyManagerError error', () => {
        return expect(
          ThirdPartyService.updateVirtualThirdParty(
            virtualThirdParty.id,
            '0x2',
            { isProgrammatic: true }
          )
        ).rejects.toThrow(UnauthorizedThirdPartyManagerError)
      })
    })

    describe('and the user is a manager of the virtual third party', () => {
      beforeEach(() => {
        virtualThirdParty.managers.push('0x2')
        VirtualThirdPartyMock.update.mockClear()
      })

      it('should update the virtual third party and resolve', () => {
        return expect(
          ThirdPartyService.updateVirtualThirdParty(
            virtualThirdParty.id,
            '0x2',
            { isProgrammatic: true }
          )
        ).resolves.toBeUndefined()
      })

      it('should authorize the manager regardless of address casing and resolve', () => {
        virtualThirdParty.managers = [
          '0xAbCdEf0000000000000000000000000000000001',
        ]
        return expect(
          ThirdPartyService.updateVirtualThirdParty(
            virtualThirdParty.id,
            '0xabcdef0000000000000000000000000000000001',
            { isProgrammatic: true }
          )
        ).resolves.toBeUndefined()
      })

      it('should only change the isProgrammatic flag and never the managers', async () => {
        await ThirdPartyService.updateVirtualThirdParty(
          virtualThirdParty.id,
          '0x2',
          { isProgrammatic: true }
        )
        expect(VirtualThirdPartyMock.update).toHaveBeenCalledWith(
          { isProgrammatic: true },
          { id: virtualThirdParty.id }
        )
      })
    })
  })
})
