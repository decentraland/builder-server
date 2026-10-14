import { env } from 'decentraland-commons'
import {
  dbCollectionMock,
  dbTPCollectionMock,
} from '../../spec/mocks/collections'
import { Collection } from '../Collection/Collection.model'
import { isCommitteeMember } from '../Committee/utils'
import { peerAPI } from '../ethereum/api/peer'
import { sendSlackMessage } from '../Slack'
import { CurationStatus } from './Curation.types'
import { curationNotifications } from './notifications'

jest.mock('../Slack', () => ({
  ...jest.requireActual('../Slack'),
  sendSlackMessage: jest.fn(),
}))
jest.mock('../Collection/Collection.model')
jest.mock('../Committee/utils')
jest.mock('../ethereum/api/peer')

const mockSend = sendSlackMessage as jest.MockedFunction<
  typeof sendSlackMessage
>
const mockProfileName = peerAPI.getProfileName as jest.MockedFunction<
  typeof peerAPI.getProfileName
>

const creator = '0x1111111111111111111111111111111111111111'
const curator = '0x2222222222222222222222222222222222222222'
const creatorLink = (label: string) =>
  `<https://decentraland.org/shop/items/creator/${creator}|${label}>`
const curatorLink = (label: string) =>
  `<https://decentraland.org/profile/${curator}|${label}>`

const envValues: Record<string, string | undefined> = {
  SLACK_CURATION_CHANNEL: 'curators-committee',
  CREATORS_URL: 'https://decentraland.org/create',
  BUILDER_URL: 'https://builder.decentraland.org',
}

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function sentText(): string {
  expect(mockSend).toHaveBeenCalledTimes(1)
  return mockSend.mock.calls[0][0].text
}

const mockFindOne = Collection.findOne as jest.Mock
const mockIsCommitteeMember = isCommitteeMember as jest.MockedFunction<
  typeof isCommitteeMember
>
let mockEnvGet: jest.SpyInstance

beforeEach(() => {
  mockEnvGet = jest
    .spyOn(env, 'get')
    .mockImplementation(
      (key: string, fallback = '') => envValues[key] ?? fallback
    )
  mockProfileName.mockResolvedValue(undefined)
  mockFindOne.mockResolvedValue(dbCollectionMock)
  mockIsCommitteeMember.mockResolvedValue(false)
})

afterEach(() => {
  jest.restoreAllMocks()
  jest.resetAllMocks()
})

describe('when the curation channel is not configured', () => {
  beforeEach(() => {
    mockEnvGet.mockImplementation(() => '')
  })

  it('should not send anything', async () => {
    await curationNotifications.collectionPublished(
      dbCollectionMock.id,
      3,
      creator
    )
    expect(mockSend).not.toHaveBeenCalled()
  })
})

describe('when a standard collection is published', () => {
  it('should announce it with the creator name, the item count and a link to the review page', async () => {
    mockProfileName.mockResolvedValueOnce('creator#1234')
    await curationNotifications.collectionPublished(
      dbCollectionMock.id,
      3,
      creator
    )

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'curators-committee' })
    )
    expect(sentText()).toBe(
      `🎨 New collection ready for review: <https://decentraland.org/create/collections/editor?collection=${
        dbCollectionMock.id
      }&reviewing=true|${dbCollectionMock.name}> by ${creatorLink(
        'creator#1234'
      )} (3 items).`
    )
  })

  it('should fall back to the short address when the creator has no name', async () => {
    await curationNotifications.collectionPublished(
      dbCollectionMock.id,
      1,
      creator
    )
    expect(sentText()).toContain(`by ${creatorLink('0x1111...1111')} (1 item).`)
  })

  it('should escape the collection name', async () => {
    mockFindOne.mockResolvedValue({
      ...dbCollectionMock,
      name: '<!channel> & co',
    })
    await curationNotifications.collectionPublished(
      dbCollectionMock.id,
      1,
      creator
    )
    expect(sentText()).toContain('|&lt;!channel&gt; &amp; co>')
  })
})

describe('when Third Party items are published', () => {
  it('should announce them with a link to the legacy editor', async () => {
    mockFindOne.mockResolvedValue(dbTPCollectionMock)
    await curationNotifications.collectionPublished(
      dbTPCollectionMock.id,
      2,
      creator
    )
    expect(sentText()).toBe(
      `📦 New Third Party items ready for review: <https://builder.decentraland.org/item-editor?collection=${
        dbTPCollectionMock.id
      }|${dbTPCollectionMock.name}> by ${creatorLink(
        '0x1111...1111'
      )} (2 items).`
    )
  })
})

describe('when a review is requested', () => {
  it('should say changes were submitted when there is no previous request', async () => {
    await curationNotifications.reviewRequested(
      dbCollectionMock.id,
      undefined,
      creator
    )
    expect(sentText()).toMatch(
      new RegExp(
        `^✏️ Changes submitted for review on <.*> by ${escapeRegExp(
          creatorLink('0x1111...1111')
        )}\\.$`
      )
    )
  })

  it('should say changes were submitted when the previous request was approved', async () => {
    await curationNotifications.reviewRequested(
      dbCollectionMock.id,
      CurationStatus.APPROVED,
      creator
    )
    expect(sentText()).toMatch(
      new RegExp(
        `^✏️ Changes submitted for review on <.*> by ${escapeRegExp(
          creatorLink('0x1111...1111')
        )}\\.$`
      )
    )
  })

  it('should say it follows a rejection when the previous request was rejected', async () => {
    await curationNotifications.reviewRequested(
      dbCollectionMock.id,
      CurationStatus.REJECTED,
      creator
    )
    expect(sentText()).toMatch(
      new RegExp(
        `^🔁 Review requested again for <.*> by ${escapeRegExp(
          creatorLink('0x1111...1111')
        )} after a rejection\\.$`
      )
    )
  })
})

describe('when a committee member opens a review request', () => {
  beforeEach(() => {
    mockIsCommitteeMember.mockResolvedValue(true)
  })

  it('should not announce it as a creator request', async () => {
    await curationNotifications.reviewRequested(
      dbCollectionMock.id,
      CurationStatus.REJECTED,
      curator
    )
    expect(mockSend).not.toHaveBeenCalled()
  })
})

describe('when the assignee changes', () => {
  it('should name the curator and who assigned them', async () => {
    mockProfileName.mockImplementation(async (address) =>
      address === curator ? 'curator' : undefined
    )
    await curationNotifications.assigneeChanged(
      dbCollectionMock.id,
      curator,
      creator
    )
    expect(sentText()).toMatch(
      new RegExp(
        `^👤 <.*> was assigned to ${escapeRegExp(
          curatorLink('curator')
        )} by ${escapeRegExp(
          `<https://decentraland.org/profile/${creator}|0x1111...1111>`
        )}\\.$`
      )
    )
  })

  it('should omit the assigner when curators assign themselves', async () => {
    mockProfileName.mockResolvedValue('curator')
    await curationNotifications.assigneeChanged(
      dbCollectionMock.id,
      curator,
      curator
    )
    expect(sentText()).toMatch(
      new RegExp(
        `^👤 <.*> was assigned to ${escapeRegExp(curatorLink('curator'))}\\.$`
      )
    )
    expect(mockProfileName).toHaveBeenCalledTimes(1)
  })

  it('should say who unassigned it', async () => {
    await curationNotifications.assigneeChanged(
      dbCollectionMock.id,
      null,
      curator
    )
    expect(sentText()).toMatch(
      new RegExp(
        `^👤 <.*> was unassigned by ${escapeRegExp(
          curatorLink('0x2222...2222')
        )}\\.$`
      )
    )
  })
})

describe('when a verdict is given', () => {
  it('should announce the approval with the curator', async () => {
    await curationNotifications.verdictGiven(
      dbCollectionMock.id,
      CurationStatus.APPROVED,
      curator
    )
    expect(sentText()).toMatch(
      new RegExp(
        `^✅ <.*> was approved by ${escapeRegExp(
          curatorLink('0x2222...2222')
        )}\\.$`
      )
    )
  })

  it('should announce the rejection with the curator', async () => {
    await curationNotifications.verdictGiven(
      dbCollectionMock.id,
      CurationStatus.REJECTED,
      curator
    )
    expect(sentText()).toMatch(
      new RegExp(
        `^❌ <.*> was rejected by ${escapeRegExp(
          curatorLink('0x2222...2222')
        )}\\.$`
      )
    )
  })
})

describe('when the collection does not exist', () => {
  beforeEach(() => {
    mockFindOne.mockResolvedValue(undefined)
  })

  it('should not send anything', async () => {
    await curationNotifications.reviewRequested(
      dbCollectionMock.id,
      undefined,
      creator
    )
    expect(mockSend).not.toHaveBeenCalled()
  })
})

describe('when building the message fails', () => {
  beforeEach(() => {
    mockProfileName.mockRejectedValueOnce(new Error('boom'))
  })

  it('should not throw', async () => {
    await expect(
      curationNotifications.verdictGiven(
        dbCollectionMock.id,
        CurationStatus.APPROVED,
        curator
      )
    ).resolves.toBeUndefined()
    expect(mockSend).not.toHaveBeenCalled()
  })
})
