import * as fs from 'fs'
import * as path from 'path'

import { Log, env } from 'decentraland-commons'
import { db, Model } from 'decentraland-server'

import * as crypto from '../src/crypto'
import { BaseContestEntry } from '../src/Contest/types'

const log = new Log('IndexScenes')

export interface SceneAttributes {
  id: string
  value: BaseContestEntry
  email: string
  title: string
  description?: string
  address?: string
  parcels_count: number
  triangles_count: number
  items_count: number
  sessions: number
  days: number
  n_events: number
  create_time: number
  tag: string
  created_at?: Date
  updated_at?: Date
}

class Scene extends Model<SceneAttributes> {
  static tableName = 'scenes'
}

const getSceneList = (baseDir: string): string[] => {
  return fs.readdirSync(baseDir)
}

const readScene = (filepath: string): BaseContestEntry => {
  const data = fs.readFileSync(filepath)
  return JSON.parse(data.toString())
}

const connectDB = () => {
  const CONNECTION_STRING = env.get('CONNECTION_STRING', undefined)
  return db.postgres.connect(CONNECTION_STRING)
}

const indexScene = async (saveData: BaseContestEntry, tag: string) => {
  const email = await crypto.decrypt(saveData.contest.email)
  log.info(`${saveData.project.id} ${email}`)

  return Scene.create<SceneAttributes>({
    id: saveData.project.id,
    value: saveData,
    email: email,
    title: saveData.project.title,
    description: saveData.project.description,
    address: saveData.contest.ethAddress,
    parcels_count: saveData.project.parcels.length,
    triangles_count: saveData.scene.metrics.triangles,
    items_count: Object.keys(saveData.scene.entities).length,
    sessions: 0,
    days: 0,
    n_events: 0,
    create_time: 0,
    tag: tag
  })
}

const indexScenesFolder = async (baseDir: string, tag: string) => {
  log.info(`Reading scenes from:${baseDir} tag:${tag}`)

  const filenames = getSceneList(baseDir)
  for (const filename of filenames) {
    try {
      const saveData = readScene(path.join(baseDir, filename))
      await indexScene(saveData, tag)
    } catch (err) {
      log.error(`Failed trying to index scene ${filename}. Error: ${err}`)
    }
  }
}

const printHelp = () => {
  console.log(`Index contest scenes into a db for easier querying.

  usage: npm run indexScenes [scenes-folder] [tag]

  positional arguments:
    scene-folder  a folder in the filesystem that contains all the scene files
    tag           a string tag to identify a batch of scenes
  `)
}

const getArgList = () => {
  const args = process.argv
  return args.slice(2, args.length)
}

async function main() {
  await connectDB()

  const args = getArgList()
  if (args.length >= 2) {
    const [baseDir, tag] = args
    await indexScenesFolder(baseDir, tag)
  } else {
    printHelp()
  }
  process.exit()
}

main().catch(console.error)
