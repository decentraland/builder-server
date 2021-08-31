import { Request, Response } from 'express'
import { server } from 'decentraland-server'

import { Router } from '../common/Router'
import { getBucketURL } from './s3'
import { S3AssetPack } from './S3AssetPack'
import { S3Content } from './S3Content'
import { S3Model } from './S3Model'

export class S3Router extends Router {
  mount() {
    /**
     * Get an asset pack file by file id
     */
    this.router.get('/storage/assetPacks/:filename', this.handleAssetPacks)

    /**
     * Get an asset file by file id (also contains items)
     */
    this.router.get('/storage/contents/:filename', this.handleContents)
  }

  private buildRedirectUrl(model: S3Model, filename: string) {
    return `${getBucketURL()}/${model.getFileKey(filename)}`
  }

  private handleAssetPacks(req: Request, res: Response) {
    const model = new S3AssetPack('')
    const filename = server.extractFromReq(req, 'filename')
    return res.redirect(this.buildRedirectUrl(model, filename))
  }

  private handleContents(req: Request, res: Response) {
    const model = new S3Content()
    const filename = server.extractFromReq(req, 'filename')
    res.setHeader('Cache-Control', 'public,max-age=31536000,immutable')
    return res.redirect(this.buildRedirectUrl(model, filename), 301)
  }
}
