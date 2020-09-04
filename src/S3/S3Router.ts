import { Request, Response } from 'express'
import { server } from 'decentraland-server'

import { Router } from '../common/Router'
import { S3AssetPack } from './S3AssetPack'
import { S3Content } from './S3Content'

export class S3Router extends Router {
  mount() {
    /**
     * Get an asset pack file by file id
     */
    this.router.get(
      '/storage/assetPacks/:filename',
      this.getHandlerForModel(S3AssetPack)
    )

    /**
     * Get an asset file by file id (also contains items)
     */
    this.router.get(
      '/storage/contents/:filename',
      this.getHandlerForModel(S3Content, true)
    )
  }

  private getHandlerForModel(
    Model: typeof S3AssetPack | typeof S3Content,
    cache: boolean = false
  ) {
    return async (req: Request, res: Response) => {
      const filename = server.extractFromReq(req, 'filename')
      const file = await new Model('').readFile(filename)

      if (file) {
        res.setHeader('Content-Type', file.ContentType!)
        if (cache) {
          res.setHeader('Cache-Control', 'public,max-age=31536000,immutable')
        }
        return res.end(file.Body)
      } else {
        return res.status(404).send('Could not find file')
      }
    }
  }
}
