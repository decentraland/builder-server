import fs from 'fs'
import { env } from 'decentraland-commons'
import { DefaultAssetResponse, DefaultAsset } from './types'

const ASSET_FOLDER = '1567613264447_data'
const ASSET_PACK_FILES_NAMES = [
  '98d8d506-59e1-468e-b873-6aa37f0ba5f3',
  '173c9b1a-b730-4065-a7a9-3e7e40da7b52',
  '83564d63-6e14-4469-abe6-60680391183c',
  'c4b073ab-92e0-49d9-9316-89044fc20858',
  'd184ef93-07f6-4fa5-bbac-0c3b6e4c5899',
  'e6fa9601-3e47-4dff-9a84-e8e017add15a',
]

export async function mapAssets(
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

export async function getAssetPackFiles(
  encoding?: BufferEncoding
): Promise<DefaultAssetResponse[]> {
  const assetPackFiles: Promise<DefaultAssetResponse>[] = []

  for (const name of ASSET_PACK_FILES_NAMES) {
    const path = `${__dirname}/${ASSET_FOLDER}/${name}.json`
    assetPackFiles.push(readJSON<DefaultAssetResponse>(path, encoding))
  }

  return Promise.all(assetPackFiles)
}

export async function readJSON<T>(
  path: string,
  encoding: BufferEncoding = 'utf8'
): Promise<T> {
  const file = await readFile(path, encoding)
  return JSON.parse(file as string)
}

export async function readFile(
  path: string,
  encoding: BufferEncoding = 'utf8'
) {
  return fs.promises.readFile(path, { encoding })
}

export function getAssetsUrl() {
  const domain = env.isProduction() ? 'org' : 'zone'
  return `https://assets.decentraland.${domain}`
}

export function getAssetPath(filename: string) {
  const dataPath = getDataPath()
  return `${dataPath}/${filename}`
}

export function getDataPath() {
  const dataDirectories = getDirectories(__dirname).sort()
  const lastData = dataDirectories.pop()
  return `${__dirname}/${lastData}`
}

export function getDirectories(source: string) {
  return fs
    .readdirSync(source, { withFileTypes: true })
    .filter((directory) => directory.isDirectory())
    .map((directory) => directory.name)
}
