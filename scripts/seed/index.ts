import https from 'https'
import fs from 'fs'
import path from 'path'
import { env, utils } from 'decentraland-commons'

import { db } from '../../src/database'
import { S3AssetPack, S3Asset, ACL } from '../../src/S3'
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
  name: string
  thumbnail: string
  url: string
  category: string
  tags: string[]
  variations: string[]
  contents: Record<string, string>
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

  for (const defaultAssetPack of assetPacks) {
    const assetPackUpsert = uploadThumbnail(defaultAssetPack).then(
      thumbnail => {
        const attributes = {
          ...utils.omit(defaultAssetPack, ['url']),
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
    const assetPromises: Promise<any>[] = []
    const assetsResponse: DefaultAssetResponse = readJSON(`${id}.json`)
    const assets = assetsResponse.data.assets

    for (const defaultAttributes of assets) {
      const thumbnail = path.basename(defaultAttributes.thumbnail)

      const attributes = {
        ...utils.omit(defaultAttributes, ['variations', 'url']),
        thumbnail,
        model: defaultAttributes.url,
        asset_pack_id: id
      } as AssetAttributes

      console.log(`Upserting asset ${attributes.id} for asset pack ${id}`)
      assetPromises.push(
        new Asset(attributes).upsert({ target: ['id', 'asset_pack_id'] })
      )

      try {
        const s3Asset = new S3Asset()

        for (const cid of Object.values(attributes.contents)) {
          const promise = s3Asset.checkFile(cid).then(async exists => {
            if (exists) {
              console.log(`File ${cid} already exists in S3`)
            } else {
              const file = await downloadAsset(cid)

              console.log(`Uploading file ${cid} to S3`)
              await s3Asset.saveFile(cid, file, ACL.publicRead)
              console.log(`File ${cid} uploaded successfully`)
            }
          })
          assetPromises.push(promise)
        }
      } catch (error) {
        // if the download errors out, we assume asset.decentraland is down and every asset has been uploaded to S3
        console.log(`Ignoring ERROR: ${error.message}`)
      }
    }

    await Promise.all(assetPromises)
  }
}

async function uploadThumbnail(attributes: DefaultAssetPack) {
  const s3AssetPack = new S3AssetPack(attributes.id)
  const filename = s3AssetPack.getThumbnailFilename()

  if (await s3AssetPack.checkFile(filename)) {
    console.log(`Thumbnail already exists in S3`)
  } else {
    const currentThumbnail = readFileSync(filename)

    console.log(`Uploading thumbnail to S3`)
    await s3AssetPack.saveFile(filename, currentThumbnail, ACL.publicRead)
  }

  return filename
}

async function downloadAsset(cid: string): Promise<Buffer> {
  const url = `${getAssetsUrl()}/${cid}`

  console.log(`Downloading ${url}`)

  return new Promise((resolve, reject) => {
    const chunks: any[] = []
    let file = Buffer.concat([])

    https.get(url, function(response) {
      response.on('data', chunk => chunks.push(chunk))
      response.on('end', () => {
        file = Buffer.concat(chunks)
        resolve(file)
      })
      response.on('error', error => reject(error))
    })
  })
}

function readJSON(filename: string) {
  return JSON.parse(readFileSync(filename, 'utf8') as string)
}

function readFileSync(filename: string, encoding?: string) {
  const dataPath = getDataPath()
  const path = `${dataPath}/${filename}`
  console.log(`Reading file ${path}`)
  return fs.readFileSync(path, encoding)
}

function getAssetsUrl() {
  const domain = env.isProduction() ? 'org' : 'zone'
  return `https://assets.decentraland.${domain}`
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
