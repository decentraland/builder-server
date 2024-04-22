import { Request, Response } from 'express'
import fetch from 'node-fetch'
import { hashV1 } from '@dcl/hashing'
import { server } from 'decentraland-server'

import { Router } from '../common/Router'
import { withCors, withPermissiveCors } from '../middleware/cors'
import { addInmutableCacheControlHeader } from '../common/headers'
import { getBucketURL } from './s3'
import { S3AssetPack } from './S3AssetPack'
import { S3Content } from './S3Content'
import { S3Model } from './S3Model'
import { withAuthentication } from '../middleware'
import { getUploader } from './uploads'

export class S3Router extends Router {
  mount() {
    /**
     * CORS for the OPTIONS header
     */
    this.router.options('/storage/assetPacks/:filename', withPermissiveCors)
    this.router.options('/storage/contents/:filename', withPermissiveCors)
    this.router.options('/storage/contents/:filename/exists', withCors)
    this.router.options('/storage/upload', withCors)

    /**
     * Get an asset pack file by file id
     */
    this.router.get(
      '/storage/assetPacks/:filename',
      withPermissiveCors,
      this.handleAssetPacks
    )

    /**
     * Get an asset file by file id (also contains items)
     */
    this.router.get(
      '/storage/contents/:filename',
      withPermissiveCors,
      this.handleContents
    )

    /**
     * Get the response headers for a file
     */
    this.router.head(
      '/storage/contents/:filename',
      withPermissiveCors,
      this.handleContents
    )

    /**
     * Return whether a file exists or not in the content server without downloading it
     */
    this.router.get(
      '/storage/contents/:filename/exists',
      withCors,
      server.handleRequest(this.handleExists)
    )

    /**
     * Upload a file
     */
    this.router.post(
      '/storage/upload',
      withCors,
      withAuthentication,
      getUploader({
        getFileStreamKey: async (file) => {
          const hash = await hashV1(file.stream)
          return new S3Content().getFileKey(hash)
        },
      }).any(),
      server.handleRequest(this.handleUpload)
    )
  }

  private buildRedirectUrl(
    model: S3Model,
    filename: string,
    ts: string | undefined
  ) {
    return `${getBucketURL()}/${model.getFileKey(filename)}${
      ts ? `?ts=${ts}` : ''
    }`
  }

  private permanentlyRedirectFile(req: Request, res: Response, model: S3Model) {
    const filename = server.extractFromReq(req, 'filename')
    // This param is to avoid cache misbehavior and force to download the file.
    const ts = req.query.ts as string
    addInmutableCacheControlHeader(res)
    return res.redirect(this.buildRedirectUrl(model, filename, ts), 301)
  }

  private handleAssetPacks = (req: Request, res: Response) => {
    const model = new S3AssetPack('')
    this.permanentlyRedirectFile(req, res, model)
  }

  private handleContents = (req: Request, res: Response) => {
    const model = new S3Content()
    this.permanentlyRedirectFile(req, res, model)
  }

  private handleExists = async (req: Request, res: Response) => {
    const model = new S3Content()
    const filename = server.extractFromReq(req, 'filename')
    const ts = req.query.ts as string
    const url = this.buildRedirectUrl(model, filename, ts)
    try {
      const content = await fetch(url)
      if (content.ok) {
        return // it exists
      }
    } catch (error) {}
    res.status(404) // it does not exist
  }

  private handleUpload(req: Request, _res: Response) {
    return {
      hash: (req.files as { fieldname: string }[])[0]!.fieldname.split('/')[1],
    }
  }
}
