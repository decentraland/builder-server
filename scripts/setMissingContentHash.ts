import { Hashing } from 'dcl-catalyst-commons'
import { Collection } from '../src/Collection'
import { db } from '../src/database'
import { Bridge } from '../src/ethereum/api/Bridge'
import { Item } from '../src/Item'
import { toBuffer } from '../src/Item/hashes'

export async function setMissingContentHash() {
  await db.connect()

  const items = await Item.findWithMissingLocalContentHash()
  const itemIds = items.map((item) => item.id)

  const collections = await Collection.findByItemIds(itemIds)
  const collectionIndex = Bridge.indexById(collections)

  const batchSize = 100
  const totalBatches = Math.round(items.length / batchSize)
  let batch = []

  console.log(
    `Updating ${items.length} items in ${totalBatches} batches of ${batchSize}`
  )

  for (const [index, item] of items.entries()) {
    const collection = collectionIndex[item.collection_id!]

    const buffer = toBuffer(item, collection)
    const promise = Hashing.calculateBufferHash(buffer).then((contentHash) =>
      Item.update({ local_content_hash: contentHash }, { id: item.id })
    )

    batch.push(promise)

    if (batch.length === batchSize) {
      console.log(
        `Running batch ${Math.round(index / batchSize)}/${totalBatches}`
      )
      await Promise.all(batch)
      batch = []
    }
  }

  if (batch.length > 0) {
    console.log(`Running batch ${totalBatches}/${totalBatches}`)
    await Promise.all(batch)
  }
}

if (require.main === module) {
  setMissingContentHash()
    .then(() => {
      console.log('All done!')
      process.exit()
    })
    .catch((err: Error) => {
      console.error(err)
      process.exit()
    })
}
