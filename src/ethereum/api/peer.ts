import fetch from 'isomorphic-fetch'
import { StandardWearable, ThirdPartyWearable } from '@dcl/schemas'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { createConsoleLogComponent } from '@well-known-components/logger'
import { env } from 'decentraland-commons'
import { LambdasClient } from 'dcl-catalyst-client'
import { AuthLink } from 'dcl-crypto'
import { logExecutionTime } from '../../utils/logging'

export const THUMBNAIL_PATH = 'thumbnail.png'

export type ValidateSignatureResponse = {
  valid: boolean
  ownerAddress: string
  error?: string
}

export type SignatureBody = {
  authChain: AuthLink[]
  timestamp: string
}

export type CatalystItem = StandardWearable | ThirdPartyWearable

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

  async fetchWearables<T extends CatalystItem>(urns: string[]): Promise<T[]> {
    return logExecutionTime(
      () =>
        urns.length > 0
          ? (this.lambdasClient.fetchWearables({
              wearableIds: urns,
            }) as Promise<T[]>)
          : [],
      this.logger,
      'Wearables Fetch'
    )
  }
}

export const peerAPI = new PeerAPI()
