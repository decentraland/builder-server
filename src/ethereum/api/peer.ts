import fetch from 'isomorphic-fetch'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { createConsoleLogComponent } from '@well-known-components/logger'
import { env } from 'decentraland-commons'
import { LambdasClient } from 'dcl-catalyst-client'
import { AuthLink } from 'dcl-crypto'
import { WearableData, WearableRepresentation } from '../../Item/wearable/types'
import { ItemRarity } from '../../Item'
import { MetricsAttributes } from '../../Metrics'
import { logExecutionTime } from '../../utils/logging'

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
  logger: ILoggerComponent.ILogger

  constructor() {
    this.lambdasClient = new LambdasClient(`${PEER_URL}/lambdas`)
    this.logger = createConsoleLogComponent().getLogger('PeerAPI')
  }

  async validateSignature(
    body: SignatureBody
  ): Promise<ValidateSignatureResponse> {
    const response = await logExecutionTime(
      () =>
        fetch(`${PEER_URL}/lambdas/crypto/validate-signature`, {
          method: 'post',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body, null, 2),
        }),
      this.logger,
      'Validate Signature Fetch'
    )
    const result = (await response.json()) as ValidateSignatureResponse
    if (!result.valid) {
      this.logger.error('Logging request unsuccessful')
      throw new Error(result.error)
    }
    return result
  }

  async fetchWearables(urns: string[]): Promise<Wearable[]> {
    const wearables: PeerWearable[] = await logExecutionTime(
      () =>
        urns.length > 0
          ? this.lambdasClient.fetchWearables({ wearableIds: urns })
          : [],
      this.logger,
      'Wearables Fetch'
    )
    return wearables.map((wearable) => this.toWearable(wearable))
  }

  private toWearable(peerWearable: PeerWearable): Wearable {
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
    }
  }
}

export const peerAPI = new PeerAPI()
