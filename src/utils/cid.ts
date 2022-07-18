import pull from 'pull-stream'
import { MemoryDatastore } from 'interface-datastore'
import CID from 'cids'
const Importer = require('ipfs-unixfs-engine').Importer

export type ContentServiceFile = {
  path: string
  content: Buffer
  size: number
}

export async function getCID(file: ContentServiceFile): Promise<string> {
  const importer = new Importer(new MemoryDatastore(), { onlyHash: true })
  return new Promise<string>((resolve, reject) => {
    pull(
      pull.values([file]),
      pull.asyncMap((file: ContentServiceFile, cb: any) => {
        const data = {
          path: file.path,
          content: file.content,
        }
        cb(null, data)
      }),
      importer,
      pull.onEnd(() => {
        return importer.flush((err: any, content: any) => {
          if (err) {
            reject(err)
          }
          resolve(new CID(content).toBaseEncodedString())
        })
      })
    )
  })
}
