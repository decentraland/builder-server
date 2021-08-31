import { Request, Response } from 'express'
import { server } from 'decentraland-server'

import { Router } from '../common/Router'
import { getBucketURL } from './s3'
import { S3AssetPack } from './S3AssetPack'
import { S3Content } from './S3Content'

export class S3Router extends Router {
  mount() {
    /**
     * Get an asset pack file by file id
     */
    this.router.get(
      '/storage/assetPacks/:filename',
      this.getHandlerForAssetType(S3AssetPack)
    )

    /**
     * Get an asset file by file id (also contains items)
     */
    this.router.get(
      '/storage/contents/:filename',
      this.getHandlerForAssetType(S3Content)
    )
  }

  private getHandlerForAssetType(Model: typeof S3AssetPack | typeof S3Content) {
    const model = new Model('')
    return async (req: Request, res: Response) => {
      const filename = server.extractFromReq(req, 'filename')
      return res.redirect(`${getBucketURL()}/${model.getFileKey(filename)}`)
    }
  }
}
