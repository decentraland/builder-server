import * as fs from 'fs'
import * as path from 'path'

import * as crypto from '../src/crypto'
import { env } from 'decentraland-commons'
import { db, Model } from 'decentraland-server'

export interface OptionAttributes {
  id: string
  value: JSON
  email: string
  title: string
  description?: string
  address?: string
  parcels_count: Number
  triangles_count: Number
  items_count: Number
  env: string
  created_at: Date
  updated_at: Date
}

class Scene extends Model<OptionAttributes> {
  static tableName = 'scenes'
}

const getSceneList = (baseDir: string): string[] => {
  return fs.readdirSync(baseDir)
}

const readScene = (filepath: string): any => {
  const data = fs.readFileSync(filepath)
  return JSON.parse(data.toString())
}

const connectDB = () => {
  const CONNECTION_STRING = env.get('CONNECTION_STRING', undefined)
  db.postgres.connect(CONNECTION_STRING)
}

const save = async (saveData: any) => {
  const email = await crypto.decrypt(saveData.contest.email)
  console.log(`${saveData.project.id} ${email}`)

  return Scene.create({
    id: saveData.project.id,
    value: saveData,
    email: email,
    title: saveData.project.title,
    description: saveData.project.description,
    address: saveData.contest.ethAddress,
    parcels_count: saveData.project.parcels.length,
    triangles_count: saveData.scene.metrics.triangles,
    items_count: Object.keys(saveData.scene.entities).length,
    env: 'org'
  })
}

async function main() {
  connectDB()

  const baseDir = process.argv.length > 2 ? process.argv.pop() || '' : ''

  const filenames = getSceneList(baseDir)
  for (const filename of filenames) {
    try {
      const saveData = readScene(path.join(baseDir, filename))
      await save(saveData)
    } catch (err) {
      console.log(err)
    }
  }
}

main()
  .catch(console.error)
  .finally(process.exit)
