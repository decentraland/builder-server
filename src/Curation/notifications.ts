import { env } from 'decentraland-commons'
import { createConsoleLogComponent } from '@well-known-components/logger'
import { Collection } from '../Collection/Collection.model'
import { isCommitteeMember } from '../Committee/utils'
import { CollectionAttributes } from '../Collection/Collection.types'
import { peerAPI } from '../ethereum/api/peer'
import {
  getLegacyItemEditorUrl,
  getStandardItemEditorUrl,
  shortenAddress,
} from '../Forum/utils'
import { escapeSlackText, sendSlackMessage, SlackBlock } from '../Slack'
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
   * ("request review again") or, for anything else, an approval ("publish changes"), since creators can
   * only open one on an approved or rejected collection and the first publication is announced on its
   * own. A committee member opening one on someone else's collection is bookkeeping (assigning or
   * rejecting a never-requested collection), not a creator asking for a review, so it is not announced.
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
    const blocks: SlackBlock[] = [
      { type: 'section', text: { type: 'mrkdwn', text } },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `Collection ${collectionId}` }],
      },
    ]
    await sendSlackMessage({ channel, text, blocks })
  } catch (error) {
    logger.warn(
      `Error sending the curation notification for ${collectionId}: ${
        (error as Error).message
      }`
    )
  }
}

function link(collection: CollectionAttributes): string {
  const url = isTPCollection(collection)
    ? getLegacyItemEditorUrl({ collectionId: collection.id })
    : getStandardItemEditorUrl({ collectionId: collection.id })
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
    return new URL(env.get('CREATORS_URL', '')).origin
  } catch (error) {
    return ''
  }
}
