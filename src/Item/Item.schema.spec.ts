import { constants } from 'ethers'
import { utils } from 'decentraland-commons'
import { dbItemMock } from '../../spec/mocks/items'
import { getValidator } from '../utils/validator'
import { areItemRepresentationsValid, itemSchema } from './Item.schema'
import { FullItem } from './Item.types'

describe("when checking if an item's representations are valid", () => {
  let item: FullItem

  beforeEach(() => {
    item = utils.omit(dbItemMock, ['created_at', 'updated_at'])
  })

  describe("and the main file of one of the representations is not included in the representation's contents", () => {
    beforeEach(() => {
      item.data.representations[0].contents = ['file1.glb']
      item.data.representations[0].mainFile = 'another-file.glb'
    })

    it('should return false', () => {
      expect(areItemRepresentationsValid(item)).toBe(false)
    })
  })

  describe("and a file in an item's representations content is is not included in the item's contents", () => {
    beforeEach(() => {
      item.data.representations[0].contents = ['file1.glb']
      item.data.representations[0].mainFile = 'file1.glb'
      item.contents = {
        'another-file.glb': 'someHash',
      }
    })

    it('should return false', () => {
      expect(areItemRepresentationsValid(item)).toBe(false)
    })
  })

  describe("and all the representations contents are included in the item's contents", () => {
    beforeEach(() => {
      item.data.representations[0].contents = ['file1.glb']
      item.data.representations[0].mainFile = 'file1.glb'
      item.contents = {
        'file1.glb': 'someHash',
      }
    })

    it('should return true', () => {
      expect(areItemRepresentationsValid(item)).toBe(true)
    })
  })
})

describe('when validating an item against the item schema', () => {
  const validate = getValidator().compile(itemSchema)
  let item: FullItem

  beforeEach(() => {
    item = utils.omit(dbItemMock, ['created_at', 'updated_at'])
  })

  describe('and the item is valid', () => {
    it('should accept it', () => {
      expect(validate({ ...item })).toBe(true)
    })
  })

  describe('and a string field contains a colon', () => {
    it.each(['thumbnail', 'video', 'utility'])(
      'should reject the %s',
      (property) => {
        expect(validate({ ...item, [property]: 'a:value' })).toBe(false)
      }
    )
  })

  describe('and the beneficiary is an eth address', () => {
    it('should accept it', () => {
      expect(validate({ ...item, beneficiary: constants.AddressZero })).toBe(
        true
      )
    })
  })

  describe('and the beneficiary is not an eth address', () => {
    it('should reject it', () => {
      expect(validate({ ...item, beneficiary: 'aBeneficiary' })).toBe(false)
    })
  })

  describe('and the price is numeric', () => {
    it('should accept it', () => {
      expect(validate({ ...item, price: '1000000000000000000' })).toBe(true)
    })
  })

  describe('and the price is not numeric', () => {
    it('should reject it', () => {
      expect(validate({ ...item, price: 'aPrice' })).toBe(false)
    })
  })
})
