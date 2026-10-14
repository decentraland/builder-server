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
      const publisher = await describeAddress(publisherAddress)
      const items = `${itemCount} ${itemCount === 1 ? 'item' : 'items'}`
      return isTPCollection(collection)
        ? `📦 New Third Party items ready for review: ${link(
            collection
          )} by ${publisher} (${items}).`
        : `🆕 New collection ready for review: ${link(
            collection
          )} by ${publisher} (${items}).`
    })
  },

  /**
   * A new review request was opened. `previousStatus` is the request it follows, if any. A committee
   * member opening one is bookkeeping (assigning or rejecting a never-requested collection), not a
   * creator asking for a review, so it is not announced.
   */
  async reviewRequested(
    collectionId: string,
    previousStatus: CurationStatus | undefined,
    requesterAddress: string
  ): Promise<void> {
    await notify(collectionId, async (collection) => {
      if (await isCommitteeMember(requesterAddress)) {
        return undefined
      }
      const requester = await describeAddress(requesterAddress)
      switch (previousStatus) {
        case CurationStatus.REJECTED:
          return `🔁 Review requested again for ${link(
            collection
          )} by ${requester} after a rejection.`
        case CurationStatus.APPROVED:
          return `✏️ Changes submitted for review on ${link(
            collection
          )} by ${requester}.`
        default:
          return `🔔 Review requested for ${link(collection)} by ${requester}.`
      }
    })
  },

  async assigneeChanged(
    collectionId: string,
    assignee: string | null,
    actorAddress: string
  ): Promise<void> {
    await notify(collectionId, async (collection) => {
      if (!assignee) {
        const actor = await describeAddress(actorAddress)
        return `👤 ${link(collection)} was unassigned by ${actor}.`
      }
      if (assignee.toLowerCase() === actorAddress.toLowerCase()) {
        const curator = await describeAddress(assignee)
        return `👤 ${link(collection)} was assigned to ${curator}.`
      }
      const [actor, curator] = await Promise.all([
        describeAddress(actorAddress),
        describeAddress(assignee),
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
      const curator = await describeAddress(curatorAddress)
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

async function describeAddress(address: string): Promise<string> {
  const name = await peerAPI.getProfileName(address)
  return name ? escapeSlackText(name) : shortenAddress(address)
}
