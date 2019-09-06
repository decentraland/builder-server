import fs from 'fs'
import { env, utils } from 'decentraland-commons'

import { db } from '../../src/database'
import { S3AssetPack } from '../../src/S3'
import { AssetPack, AssetPackAttributes } from '../../src/AssetPack'
import { Asset, AssetAttributes } from '../../src/Asset'

type DefaultAssetPack = {
  id: string
  title: string
  url: string
  thumbnail: string
}
type DefaultAsset = {
  id: string
}

type DefaultAssetPackResponse = {
  ok: boolean
  data: {
    packs: DefaultAssetPack[]
  }
}
type DefaultAssetResponse = {
  ok: boolean
  data: {
    id: string
    version: number
    title: string
    assets: DefaultAsset[]
  }
}

const DEFAULT_USER_ID = env.get('DEFAULT_USER_ID', '')
if (!DEFAULT_USER_ID) {
  throw new Error(
    'You need to set a DEFAULT_USER_ID on your env to set as the user_id of each asset pack'
  )
}

export async function seed() {
  const packsResponse: DefaultAssetPackResponse = readJSON('packs.json')
  const assetPacks = packsResponse.data.packs

  console.log('==== Asset packs ====')
  await upsertAssetPacks(assetPacks)

  console.log('==== Assets ====')
  await upsertAssets(assetPacks)
}

async function upsertAssetPacks(assetPacks: DefaultAssetPack[]) {
  const assetPackUpserts = []
  const now = new Date()

  for (const defaultAttributes of assetPacks) {
    const assetPackUpsert = uploadThumbnail(defaultAttributes).then(
      thumbnail => {
        const attributes = {
          ...defaultAttributes,
          thumbnail,
          user_id: DEFAULT_USER_ID,
          created_at: now,
          updated_at: now
        } as AssetPackAttributes

        console.log(
          `Upserting asset pack ${attributes.id} for user ${attributes.user_id}`
        )

        return new AssetPack(attributes).upsert()
      }
    )
    assetPackUpserts.push(assetPackUpsert)
  }

  await Promise.all(assetPackUpserts)
}

async function upsertAssets(assetPacks: DefaultAssetPack[]) {
  for (const { id } of assetPacks) {
    const assetUpserts = []
    const assetsResponse: DefaultAssetResponse = readJSON(`${id}.json`)
    const assets = assetsResponse.data.assets

    for (const defaultAttributes of assets) {
      const attributes = {
        ...utils.omit(defaultAttributes, ['variations']),
        asset_pack_id: id
      } as AssetAttributes

      console.log(`Upserting asset ${attributes.id} for asset pack ${id}`)
      assetUpserts.push(new Asset(attributes).upsert())
    }

    await Promise.all(assetUpserts)
  }
}

async function uploadThumbnail(attributes: DefaultAssetPack) {
  const currentThumbnail = readFile(`${attributes.id}.png`)

  console.log(`Uploading thumbnail to S3`)
  const { Location } = await new S3AssetPack(attributes.id).saveFile(
    'thumbnail.png',
    currentThumbnail
  )

  return Location
}

function readJSON(filename: string) {
  return JSON.parse(readFile(filename, 'utf8') as string)
}

function readFile(filename: string, encoding?: string) {
  const dataPath = getDataPath()
  const path = `${dataPath}/${filename}`
  console.log(`Reading file ${path}`)
  return fs.readFileSync(path, encoding)
}

function getDataPath() {
  const dataDirectories = getDirectories(__dirname).sort()
  const lastData = dataDirectories.pop()
  return `${__dirname}/${lastData}`
}

function getDirectories(source: string) {
  return fs
    .readdirSync(source, { withFileTypes: true })
    .filter(directory => directory.isDirectory())
    .map(directory => directory.name)
}

if (require.main === module) {
  db
    .connect()
    .then(seed)
    .then(() => {
      console.log('All done!')
      process.exit()
    })
}
