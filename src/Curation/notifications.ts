import { env } from 'decentraland-commons'
import { createConsoleLogComponent } from '@well-known-components/logger'
import { Collection } from '../Collection/Collection.model'
import { isCommitteeMember } from '../Committee/utils'
import { CollectionAttributes } from '../Collection/Collection.types'
import { peerAPI } from '../ethereum/api/peer'
import {
  getItemEditorUrl,
  shortenAddress,
} from '../Forum/utils'
import { escapeSlackText, sendSlackMessage } from '../Slack'
import { isTPCollection } from '../utils/urn'
import { CurationStatus } from './Curation.types'

const CHANNEL_KEY = 'SLACK_CURATION_CHANNEL'
const logger = createConsoleLogComponent().getLogger('CurationNotifications')

export type CurationVerdict = CurationStatus.APPROVED | CurationStatus.REJECTED

/**
 * Messages for the curators' Slack channel. Every method is best effort and never throws, so callers
 * can fire and forget them.
 */
export const curationNotifications = {
  /** A collection (or a batch of Third Party items) was published and waits for its first review. */
  async collectionPublished(
    collectionId: string,
    itemCount: number,
    publisherAddress: string
  ): Promise<void> {
    await notify(collectionId, async (collection) => {
      const publisher = await describeAddress(publisherAddress, 'creator')
      const items = `${itemCount} ${itemCount === 1 ? 'item' : 'items'}`
      return isTPCollection(collection)
        ? `📦 New Third Party items ready for review: ${link(
            collection
          )} by ${publisher} (${items}).`
        : `🎨 New collection ready for review: ${link(
            collection
          )} by ${publisher} (${items}).`
    })
  },

  /**
   * A creator opened a new review request. `previousStatus` is the request it follows: a rejection
   * ("request review again") or, otherwise, an approval ("publish changes"). The clients only offer
   * those two; the server does not enforce it, so a direct call on a never-reviewed collection is
   * worded as submitted changes too. A committee member opening one on someone else's collection is
   * bookkeeping (assigning or rejecting a never-requested collection), not a creator asking for a
   * review, so it is not announced.
   */
  async reviewRequested(
    collectionId: string,
    previousStatus: CurationStatus | undefined,
    requesterAddress: string
  ): Promise<void> {
    await notify(collectionId, async (collection) => {
      const isOwner =
        collection.eth_address.toLowerCase() === requesterAddress.toLowerCase()
      if (!isOwner && (await isCommitteeMember(requesterAddress))) {
        return undefined
      }
      const requester = await describeAddress(requesterAddress, 'creator')
      return previousStatus === CurationStatus.REJECTED
        ? `🔁 Review requested again for ${link(
            collection
          )} by ${requester} after a rejection.`
        : `✏️ Changes submitted for review on ${link(
            collection
          )} by ${requester}.`
    })
  },

  async assigneeChanged(
    collectionId: string,
    assignee: string | null,
    actorAddress: string
  ): Promise<void> {
    await notify(collectionId, async (collection) => {
      if (!assignee) {
        const actor = await describeAddress(actorAddress, 'curator')
        return `👤 ${link(collection)} was unassigned by ${actor}.`
      }
      if (assignee.toLowerCase() === actorAddress.toLowerCase()) {
        const curator = await describeAddress(assignee, 'curator')
        return `👤 ${link(collection)} was assigned to ${curator}.`
      }
      const [actor, curator] = await Promise.all([
        describeAddress(actorAddress, 'curator'),
        describeAddress(assignee, 'curator'),
      ])
      return `👤 ${link(collection)} was assigned to ${curator} by ${actor}.`
    })
  },

  async verdictGiven(
    collectionId: string,
    verdict: CurationVerdict,
    curatorAddress: string
  ): Promise<void> {
    await notify(collectionId, async (collection) => {
      const curator = await describeAddress(curatorAddress, 'curator')
      const emoji = verdict === CurationStatus.APPROVED ? '✅' : '❌'
      return `${emoji} ${link(collection)} was ${verdict} by ${curator}.`
    })
  },

  /** The automatic review was not requested, so no result will follow in the channel. */
  async validationNotRequested(
    collectionId: string,
    reason: string
  ): Promise<void> {
    await notify(
      collectionId,
      async (collection) =>
        `⚠️ No automatic review for ${link(
          collection
        )}: ${reason}. It needs a curator review without it.`
    )
  },
}

async function notify(
  collectionId: string,
  buildText: (collection: CollectionAttributes) => Promise<string | undefined>
): Promise<void> {
  const channel = env.get(CHANNEL_KEY, '')
  if (!channel) {
    return
  }
  try {
    const collection = await Collection.findOne<CollectionAttributes>(
      collectionId
    )
    if (!collection) {
      return
    }
    const text = await buildText(collection)
    if (!text) {
      return
    }
    await sendSlackMessage({ channel, text })
  } catch (error) {
    logger.warn(
      `Error sending the curation notification for ${collectionId}: ${
        (error as Error).message
      }`
    )
  }
}

function link(collection: CollectionAttributes): string {
  const url = getItemEditorUrl({ collectionId: collection.id })
  return `<${url}|${escapeSlackText(collection.name)}>`
}

/** The person as a link: creators to their shop page, curators to their profile. */
async function describeAddress(
  address: string,
  role: 'creator' | 'curator'
): Promise<string> {
  const name = await peerAPI.getProfileName(address)
  const label = name ? escapeSlackText(name) : shortenAddress(address)
  const origin = getSiteOrigin()
  if (!origin) {
    return label
  }
  const path =
    role === 'creator'
      ? `/shop/items/creator/${address.toLowerCase()}`
      : `/profile/${address.toLowerCase()}`
  return `<${origin}${path}|${label}>`
}

/** The shop and the profiles live on the same site as the creators app. */
function getSiteOrigin(): string {
  try {
    const { origin } = new URL(env.get('CREATORS_URL', ''))
    // A non-http(s) URL has the literal origin "null".
    return origin === 'null' ? '' : origin
  } catch (error) {
    return ''
  }
}
