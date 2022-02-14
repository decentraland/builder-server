import { utils } from 'decentraland-commons'
import { dbItemMock } from '../../spec/mocks/items'
import { areItemRepresentationsValid } from './Item.schema'
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
