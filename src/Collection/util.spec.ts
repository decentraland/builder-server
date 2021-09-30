import { Collection } from '.'
import { Bridge } from '../ethereum/api/Bridge'
import { collectionAPI } from '../ethereum/api/collection'
import { getMergedCollection } from './util'

describe('getMergedCollection', () => {
  let sampleCollection: { id: string }

  beforeEach(() => {
    sampleCollection = {
      id: 'collectionId',
    }
  })

  describe('when the db collection can not be found', () => {
    it('should resolve with an undefined collection and a not found status', async () => {
      jest.spyOn(Collection, 'findOne').mockResolvedValueOnce(undefined)

      const { collection, status } = await getMergedCollection(
        sampleCollection.id
      )

      expect(status).toBe('not_found')
      expect(collection).toBeUndefined()
    })
  })

  describe('when the remote collection can not be found', () => {
    it('should resolve with the db collection and an incomplete status', async () => {
      jest.spyOn(Collection, 'findOne').mockResolvedValueOnce(sampleCollection)
      jest.spyOn(collectionAPI, 'fetchCollection').mockResolvedValueOnce(null)

      const { collection, status } = await getMergedCollection(
        sampleCollection.id
      )

      expect(status).toBe('incomplete')
      expect(collection).toStrictEqual(sampleCollection)
    })
  })

  describe('when both the db and remote collection are obtained', () => {
    it('should resolve with the merged collection and a complete status', async () => {
      jest.spyOn(Collection, 'findOne').mockResolvedValueOnce(sampleCollection)

      jest
        .spyOn(collectionAPI, 'fetchCollection')
        .mockResolvedValueOnce(sampleCollection as any)

      jest
        .spyOn(Bridge, 'mergeCollection')
        .mockReturnValueOnce(sampleCollection as any)

      const { collection, status } = await getMergedCollection('collectionId')

      expect(status).toBe('complete')
      expect(collection).toStrictEqual(sampleCollection)
    })
  })
})
