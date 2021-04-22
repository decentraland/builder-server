import fetch from 'isomorphic-fetch'
import { env } from 'decentraland-commons'
import { AuthLink } from 'dcl-crypto'
import { WearableData } from '../../Item/wearable/types'
import { ItemRarity } from '../../Item'
import { MetricsAttributes } from '../../Metrics'
import { LambdasClient } from 'dcl-catalyst-client'

export type Wearable = {
  id: string
  name: string
  description: string
  collectionAddress: string
  rarity: ItemRarity
  data: WearableData
  image: string
  thumbnail: string
  metrics: MetricsAttributes
  contents: Record<string, string>
  createdAt: number
  updatedAt: number
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
    return urns.length > 0
      ? this.lambdasClient.fetchWearables({ wearableIds: urns })
      : []
  }
}

export const peerAPI = new PeerAPI()
