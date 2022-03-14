import { Hashing } from 'dcl-catalyst-commons'
import { Collection } from '../src/Collection'
import { db } from '../src/database'
import { Bridge } from '../src/ethereum/api/Bridge'
import { Item } from '../src/Item'
import { toBuffer } from '../src/Item/hashes'

export async function main() {
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
    const contentHash = await Hashing.calculateBufferHash(
      toBuffer(item, collection)
    )

    console.log(`Updating item ${item.id} with hash ${contentHash}`)
    batch.push(
      Item.update({ local_content_hash: contentHash }, { id: item.id })
    )

    if (batch.length === batchSize) {
      console.log(
        `Running batch ${Math.round(index / batchSize)}/${totalBatches}`
      )
      await Promise.all(batch)
      batch = []
    }
  }

  if (batch.length > 0) {
    await Promise.all(batch)
  }
}

if (require.main === module) {
  db.connect()
    .then(main)
    .then(() => {
      console.log('All done!')
      process.exit()
    })
    .catch((err: Error) => {
      console.error(err)
      process.exit()
    })
}