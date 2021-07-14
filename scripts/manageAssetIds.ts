import fs from 'fs'
import { Asset } from '../src/Asset'
import { db } from '../src/database'

import { DefaultAssetResponse, DefaultAsset } from './seed'

const ASSET_FOLDER = '1567613264447_data'
const ASSET_PACK_FILES_NAMES = [
  '98d8d506-59e1-468e-b873-6aa37f0ba5f3',
  '173c9b1a-b730-4065-a7a9-3e7e40da7b52',
  '83564d63-6e14-4469-abe6-60680391183c',
  'c4b073ab-92e0-49d9-9316-89044fc20858',
  'd184ef93-07f6-4fa5-bbac-0c3b6e4c5899',
  'e6fa9601-3e47-4dff-9a84-e8e017add15a',
]

export async function updateAssetIds() {
  return mapAssets((assetPack, asset) =>
    Asset.update(
      { id: asset.id },
      { id: asset.legacy_id, asset_pack_id: assetPack.id }
    )
  )
}

export async function restoreLegacyAssetIds() {
  return mapAssets((_assetPack, asset) =>
    Asset.update({ id: asset.legacy_id }, { id: asset.id })
  )
}

async function mapAssets(
  callback: (
    assetPack: DefaultAssetResponse['data'],
    asset: DefaultAsset
  ) => Promise<any>
) {
  const updates = []
  const assetPackFiles = await getAssetPackFiles()

  for (const assetPackFile of assetPackFiles) {
    const assetPack = assetPackFile.data
    for (const asset of assetPack.assets) {
      updates.push(callback(assetPack, asset))
    }
  }

  await Promise.all(updates)
}

async function getAssetPackFiles(
  encoding?: BufferEncoding
): Promise<DefaultAssetResponse[]> {
  const assetPackFiles: Promise<DefaultAssetResponse>[] = []

  for (const name of ASSET_PACK_FILES_NAMES) {
    const path = `${__dirname}/seed/${ASSET_FOLDER}/${name}.json`
    assetPackFiles.push(readJSON<DefaultAssetResponse>(path, encoding))
  }

  return Promise.all(assetPackFiles)
}

async function readJSON<T>(
  path: string,
  encoding: BufferEncoding = 'utf8'
): Promise<T> {
  const file = await fs.promises.readFile(path, { encoding })
  return JSON.parse(file as string)
}

if (require.main === module) {
  db.connect()
    .then(updateAssetIds)
    .then(() => console.log('Done'))
    .then(() => {
      console.log('All done!')
      process.exit()
    })
    .catch((err: Error) => {
      console.error(err)
      process.exit()
    })
}
