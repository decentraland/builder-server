import { S3Model } from './S3Model'

export class S3AssetPack extends S3Model {
  constructor(id: string) {
    super(id, 'asset_packs')
  }

  getThumbnailFilename() {
    return `${this.id}.png`
  }

  getFolder(): string {
    return `${this.type}`
  }

  getAssetFileKey(assetId: string, filename: string) {
    return this.getFileKey('') + `assets/${assetId}/${filename}`
  }
}
