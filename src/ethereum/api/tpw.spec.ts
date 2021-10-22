import { env } from 'decentraland-commons'
import { thirdPartyAPI } from './thirdParty'
import { isManager } from './tpw'

jest.mock('decentraland-commons')
jest.mock('./thirdParty')

describe('isManager', () => {
  describe('when an address belongs to the TPW_MANAGER_ADDRESSES env var', () => {
    let manager: string
    beforeEach(() => {
      manager = '0x123123'
      ;(env.get as jest.Mock).mockReturnValueOnce(
        `0x555,${manager},0x444,0x333`
      )
    })

    it('should return true', async () => {
      expect(await isManager('', manager)).toBe(true)
      expect(env.get).toHaveBeenCalledWith('TPW_MANAGER_ADDRESSES', '')
    })
  })

  describe('when an address does not belong to the TPW_MANAGER_ADDRESSES env var', () => {
    let urn: string
    let manager: string

    beforeEach(() => {
      urn = 'some:valid:urn'
      manager = '0x123123'
      ;(env.get as jest.Mock).mockReturnValueOnce(`0x555,0x444,0x333`)
    })

    describe('when thegraph has a urn with the address as manager', () => {
      beforeEach(() => {
        ;(thirdPartyAPI.isManager as jest.Mock).mockReturnValueOnce(true)
      })

      it('should return true', async () => {
        expect(await isManager(urn, manager)).toBe(true)
        expect(thirdPartyAPI.isManager).toHaveBeenCalledWith(urn, manager)
        expect(env.get).toHaveBeenCalledWith('TPW_MANAGER_ADDRESSES', '')
      })
    })

    describe('when thegraph does not has a urn with the address as manager', () => {
      beforeEach(() => {
        ;(thirdPartyAPI.isManager as jest.Mock).mockReturnValueOnce(false)
      })

      it('should return true', async () => {
        expect(await isManager(urn, manager)).toBe(false)
        expect(thirdPartyAPI.isManager).toHaveBeenCalledWith(urn, manager)
        expect(env.get).toHaveBeenCalledWith('TPW_MANAGER_ADDRESSES', '')
      })
    })
  })
})
