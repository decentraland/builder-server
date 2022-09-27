import { Request, Response } from 'express'
import { server } from 'decentraland-server'

import { Router } from '../common/Router'
import { addInmutableCacheControlHeader } from '../common/headers'
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

    /**
     * Get the response headers for a file
     */
    this.router.head('/storage/contents/:filename', this.handleContents)
  }

  private buildRedirectUrl(model: S3Model, filename: string) {
    return `${getBucketURL()}/${model.getFileKey(filename)}`
  }

  private permanentlyRedirectFile(req: Request, res: Response, model: S3Model) {
    const filename = server.extractFromReq(req, 'filename')
    addInmutableCacheControlHeader(res)
    return res.redirect(this.buildRedirectUrl(model, filename), 301)
  }

  private handleAssetPacks = (req: Request, res: Response) => {
    const model = new S3AssetPack('')
    this.permanentlyRedirectFile(req, res, model)
  }

  private handleContents = (req: Request, res: Response) => {
    const model = new S3Content()
    this.permanentlyRedirectFile(req, res, model)
  }
}
