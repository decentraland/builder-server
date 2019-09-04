import { utils } from 'decentraland-commons'
import { server } from 'decentraland-server'
import Ajv from 'ajv'

import { Router } from '../common/Router'
import { HTTPError, STATUS_CODES } from '../common/HTTPError'
import { authentication, AuthRequest, modelExists } from '../middleware'
import { modelAuthorization } from '../middleware/authorization'
import { Ownable } from '../Ownable'
import { Asset, AssetAttributes, assetPackSchema } from '../Asset'

const BLACKLISTED_PROPERTIES = ['is_deleted']
const ajv = new Ajv()

export class AssetPackRouter extends Router {
  mount() {
    const assetPackExists = modelExists(AssetPack)
    const assetPackAuthorization = modelAuthorization(AssetPack)

    /**
     * Get all asset packs
     */
    this.router.get('/assetPacks', server.handleRequest(this.getAssetPacks))

    /**
     * Get asset pack
     */
    this.router.get('/assetPacks/:id', server.handleRequest(this.getAssetPack))

    /**
     * Upsert an asset pack and its assets
     */
    this.router.put(
      '/assetPacks/:id',
      authentication,
      server.handleRequest(this.upsertAssetPack)
    )

    /**
     * Delete asset pack
     */
    this.router.delete(
      '/assetPacks/:id',
      authentication,
      assetPackExists,
      assetPackAuthorization,
      server.handleRequest(this.deleteAssetPack)
    )
  }

  async getAssetPacks(req: AuthRequest) {
    const user_id = req.auth ? req.auth.sub : ''
    const assetPacks = await AssetPack.findVisible(user_id)
    return this.sanitize(assetPacks)
  }

  async getAssetPack(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    const user_id = req.auth ? req.auth.sub : ''

    const isVisible = await AssetPack.isVisible(id, user_id)

    if (!isVisible) {
      throw new HTTPError(
        'Unauthorized user',
        { user_id },
        STATUS_CODES.unauthorized
      )
    }

    const assetPacks = await AssetPack.findWithAssets(id)

    if (assetPacks.length === 0) {
      throw new HTTPError(
        'Asset pack not found',
        { id, user_id },
        STATUS_CODES.notFound
      )
    }

    return this.sanitize(assetPacks)
  }

  async upsertAssetPack(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    const assetPackJSON: any = server.extractFromReq(req, 'assetPack')
    const user_id = req.auth.sub

    const validator = ajv.compile(assetPackSchema)
    validator(assetPackJSON)

    if (validator.errors) {
      throw new HTTPError('Invalid schema', validator.errors)
    }

    const canUpsert = await new Ownable(AssetPack).canUpsert(id, user_id)
    if (!canUpsert) {
      throw new HTTPError('Unauthorized user', { id, user_id })
    }

    const assets: AssetAttributes[] = utils.pick(assetPackJSON, ['assets'])
    const attributes = {
      ...utils.omit(assetPackJSON, ['assets']),
      user_id
    } as AssetPackAttributes

    if (id !== attributes.id) {
      throw new HTTPError('The body and URL assetPack ids do not match', {
        urlId: id,
        bodyId: attributes.id
      })
    }

    const upsertResult = await new AssetPack(attributes).upsert()
    await Promise.all(assets.map(asset => new Asset(asset).upsert))

    return upsertResult
  }

  async deleteAssetPack(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    const user_id = req.auth.sub
    await AssetPack.delete({ id, user_id })
    return true
  }

  private sanitize(assetPacks: AssetPackAttributes[]) {
    return utils.mapOmit<AssetPackAttributes>(
      assetPacks,
      BLACKLISTED_PROPERTIES
    )
  }
}
