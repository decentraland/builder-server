import { env, utils } from 'decentraland-commons'

import { db } from '../src/database'
import { AssetPack, FullAssetPackAttributes } from '../src/AssetPack'

const DEFAULT_USER_ID = env.get('DEFAULT_USER_ID', '')
const DEFAULT_ETH_ADDRESS = env.get('DEFAULT_ETH_ADDRESS', '')

console.log(
  `Migrating asset packs from user_id="${DEFAULT_USER_ID}" into eth_address="${DEFAULT_ETH_ADDRESS}"`
)

if (!DEFAULT_USER_ID) {
  throw new Error(
    'You need to set a DEFAULT_USER_ID on your env to set as the user_id to load the default asset packs to migrate'
  )
}

if (!DEFAULT_ETH_ADDRESS) {
  throw new Error(
    'You need to set a DEFAULT_ETH_ADDRESS on your env to set as the eth_address of each default asset pack'
  )
}

export async function migrate() {
  console.log('Find default asset packs to migrate')
  const defaultAssetPacks = await AssetPack.LEGACY_findByUserIdWithAssets(
    DEFAULT_USER_ID
  )

  const promises = []
  for (const assetPack of defaultAssetPacks) {
    console.log(`Start migrating asset pack "${assetPack.title}"`)
    const attributes = {
      ...utils.omit<Omit<FullAssetPackAttributes, 'assets'>>(assetPack, [
        'assets'
      ]),
      eth_address: DEFAULT_ETH_ADDRESS
    }
    promises.push(
      new AssetPack(attributes)
        .upsert()
        .then(() =>
          console.log(`Finished migrating asset pack "${assetPack.title}"`)
        )
    )
  }
  await Promise.all(promises)
}

if (require.main === module) {
  db.connect()
    .then(migrate)
    .then(() => {
      console.log('All done!')
      process.exit()
    })
    .catch((err: Error) => {
      console.error(err)
      process.exit()
    })
}
