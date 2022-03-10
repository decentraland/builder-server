import { v4 as uuidv4 } from 'uuid'
import { CurationStatus } from '../../src/Curation'
import { ItemCurationAttributes } from '../../src/Curation/ItemCuration'
import { dbTPItemMock } from './items'

export const itemCurationMock: ItemCurationAttributes = {
  id: uuidv4(),
  item_id: dbTPItemMock.id,
  status: CurationStatus.APPROVED,
  created_at: new Date(),
  updated_at: new Date(),
  content_hash: 'aHash',
}
