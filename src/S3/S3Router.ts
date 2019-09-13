import { Request, Response } from 'express'
import { server } from 'decentraland-server'

import { Router } from '../common/Router'
import { S3AssetPack } from './S3AssetPack'
import { S3Asset } from './S3Asset'

/*
 * This is moslty used for development purposes,
 * in production this endpoint is taken care of by a rewrite directly to S3
 */
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
     * Get an asset file by file id
     */
    this.router.get(
      '/storage/assets/:filename',
      this.getHandlerForModel(S3Asset)
    )
  }

  private getHandlerForModel(Model: typeof S3AssetPack | typeof S3Asset) {
    return async (req: Request, res: Response) => {
      const filename = server.extractFromReq(req, 'filename')
      const file = await new Model('').readFile(filename)

      if (file) {
        res.setHeader('Content-Type', file.ContentType!)
        return res.end(file.Body)
      } else {
        return res.status(404).send('Could not find file')
      }
    }
  }
}
