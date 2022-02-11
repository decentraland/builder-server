import { matchers } from './matchers'

describe('matchers', () => {
  describe('when the urn matchers is generated', () => {
    let decentralandURN: string
    let thirdPartyURN: string

    beforeEach(() => {
      decentralandURN =
        'urn:decentraland:mumbai:collections-v2:0xc6d2000a7a1ddca92941f4e2b41360fe4ee2abd8'
      thirdPartyURN =
        'urn:decentraland:matic:collections-thirdparty:crypto-motors:some-name'
    })

    it('should append the other matchers', () => {
      expect(matchers.urn).toBe(
        'urn:decentraland:(mainnet|ropsten|matic|mumbai):(?:collections-thirdparty:[^:|\\s]+:[^:|\\s]+|collections-v2:0x[a-fA-F0-9]{40})'
      )
    })

    it('should match a decentraland URN', () => {
      expect(new RegExp(matchers.urn).test(decentralandURN)).toBe(true)
    })

    it('should match a third party URN', () => {
      expect(new RegExp(matchers.urn).test(thirdPartyURN)).toBe(true)
    })
  })
})
