import fetch from 'isomorphic-fetch'
import { env } from 'decentraland-commons'
import { LambdasClient } from 'dcl-catalyst-client'
import { AuthLink } from 'dcl-crypto'
import { WearableData, WearableRepresentation } from '../../Item/wearable/types'
import { ItemRarity } from '../../Item'
import { MetricsAttributes } from '../../Metrics'

export const THUMBNAIL_PATH = 'thumbnail.png'

export type Wearable = {
  id: string
  name: string
  description: string
  collectionAddress: string
  rarity: ItemRarity
  image: string
  thumbnail: string
  metrics: MetricsAttributes
  contents: Record<string, string>
  data: WearableData
  createdAt: number
  updatedAt: number
}

export type PeerRepresentation = Omit<WearableRepresentation, 'contents'> & {
  contents: { key: string; url: string }[]
}
export type PeerData = Omit<WearableData, 'representations'> & {
  representations: PeerRepresentation[]
}

export type PeerWearable = Omit<Wearable, 'data'> & {
  data: PeerData
}

export type ValidateSignatureResponse = {
  valid: boolean
  ownerAddress: string
  error?: string
}
export type SignatureBody = {
  authChain: AuthLink[]
  timestamp: string
}

export const PEER_URL = env.get('PEER_URL', '')

export class PeerAPI {
  lambdasClient: LambdasClient

  constructor() {
    this.lambdasClient = new LambdasClient(`${PEER_URL}/lambdas`)
  }

  async validateSignature(
    body: SignatureBody
  ): Promise<ValidateSignatureResponse> {
    const response = await fetch(
      `${PEER_URL}/lambdas/crypto/validate-signature`,
      {
        method: 'post',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body, null, 2),
      }
    )
    const result = (await response.json()) as ValidateSignatureResponse
    if (!result.valid) {
      throw new Error(result.error)
    }
    return result
  }

  async fetchWearables(urns: string[]): Promise<Wearable[]> {
    const wearables: PeerWearable[] =
      urns.length > 0
        ? await this.lambdasClient.fetchWearables({ wearableIds: urns })
        : []
    return wearables.map(this.toWearable)
  }

  private toWearable(peerWearable: PeerWearable): Wearable {
    const contents: Record<string, string> = {}
    for (let representation of peerWearable.data.representations) {
      for (let content of representation.contents) {
        contents[content.key] = content.url.split('/').pop()!
      }
    }

    contents[THUMBNAIL_PATH] = peerWearable.thumbnail.split('/').pop()!

    return {
      ...peerWearable,
      data: {
        ...peerWearable.data,
        representations: [
          ...peerWearable.data.representations.map((representation) => ({
            ...representation,
            contents: representation.contents.map((content) => content.key),
          })),
        ],
      },
      contents,
    }
  }
}

export const peerAPI = new PeerAPI()
