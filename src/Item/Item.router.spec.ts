import { ExpressApp } from '../common/ExpressApp'
import { ItemRouter } from './Item.router'

jest.mock('../common/Router')
jest.mock('../common/ExpressApp')

describe('when upsertItem is called', () => {
  it('should fail when param id is different from item id', async () => {
    const app = new ExpressApp()
    const router = new ItemRouter(app)

    const req: any = {
      query: { id: 'id' },
      body: { item: { id: 'different id' } },
    }

    await expect(router.upsertItem(req)).rejects.toThrowError('The body and URL item ids do not match')
  })
})
