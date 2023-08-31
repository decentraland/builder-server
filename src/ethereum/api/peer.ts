import { Emote, Wearable } from '@dcl/schemas'
import { AuthLink } from '@dcl/crypto'
import { IFetchComponent, ILoggerComponent } from '@well-known-components/interfaces'
import { createConsoleLogComponent } from '@well-known-components/logger'
import { createFetchComponent } from '@well-known-components/fetch-component'
import { env } from 'decentraland-commons'
import { ContentClient, createContentClient } from 'dcl-catalyst-client/dist/client/ContentClient'
import { ItemAttributes, ItemType } from '../../Item'
import { CollectionAttributes } from '../../Collection'
import { logExecutionTime } from '../../utils/logging'
import { ItemFragment } from './fragments'
import { collectionAPI } from './collection'

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

export type CatalystItem = Wearable | Emote

export const PEER_URL = env.get('PEER_URL', '')

export class PeerAPI {
  contentClient: ContentClient
  logger: ILoggerComponent.ILogger
  fetcher: IFetchComponent

  constructor() {
    this.fetcher = createFetchComponent()
    this.contentClient = createContentClient({
      url: `${PEER_URL}/content`,
      fetcher: this.fetcher
    })
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
          ? (this.contentClient.fetchEntitiesByIds(urns)
              .then((entities) => entities.map((entity) => entity.metadata)) as Promise<T[]>)
          : [],
      this.logger,
      'Wearables Fetch'
    )
  }

  async fetchEmotes<T extends CatalystItem>(urns: string[]): Promise<T[]> {
    return logExecutionTime(
      () =>
        urns.length > 0
          ? (this.contentClient.fetchEntitiesByIds(urns)
              .then((entities) => entities.map((entity) => entity.metadata)) as Promise<T[]>)
          : [],
      this.logger,
      'Emotes Fetch'
    )
  }

  async fetchItems<T extends CatalystItem>(
    dbItems: ItemAttributes[],
    remoteItems: ItemFragment[],
    dbCollectionResults: CollectionAttributes[]
  ): Promise<T[]> {
    const emotesURNs = dbItems
      .filter((dbItem) => dbItem.type === ItemType.EMOTE)
      .map((item) => {
        const dbCollection = dbCollectionResults.find(
          (dbCollection) => dbCollection.id === item.collection_id
        )
        const remoteItem =
          dbCollection &&
          remoteItems.find(
            (remoteItem) =>
              remoteItem.id ===
              collectionAPI.buildItemId(
                dbCollection.contract_address!,
                item.blockchain_item_id!
              )
          )
        return remoteItem && remoteItem.urn
      })
      .filter(Boolean) as string[] // to remove undefined's

    const wearablesURNs = remoteItems
      .filter((remoteItem) => !emotesURNs.includes(remoteItem.urn))
      .map((item) => item.urn)

    const peerWearablesPromises = wearablesURNs.length
      ? this.fetchWearables<Wearable>(wearablesURNs)
      : Promise.resolve([])

    const peerEmotesPromises = emotesURNs.length
      ? this.fetchEmotes<Emote>(emotesURNs)
      : Promise.resolve([])

    return (
      await Promise.all([peerWearablesPromises, peerEmotesPromises])
    ).flat() as T[]
  }
}

export const peerAPI = new PeerAPI()
