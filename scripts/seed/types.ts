export type DefaultAssetPack = {
  id: string
  title: string
  url: string
  thumbnail: string
}

export type DefaultAsset = {
  id: string
  legacy_id: string
  name: string
  thumbnail: string
  url: string
  category: string
  tags: string[]
  variations: string[]
  contents: Record<string, string>
}

export type DefaultAssetPackResponse = {
  ok: boolean
  data: {
    packs: DefaultAssetPack[]
  }
}

export type DefaultAssetResponse = {
  ok: boolean
  data: {
    id: string
    version: number
    title: string
    assets: DefaultAsset[]
  }
}
