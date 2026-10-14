import { PublishCommand } from '@aws-sdk/client-sns'
import { v4 as uuidv4 } from 'uuid'
import { dbCollectionMock } from '../../spec/mocks/collections'
import { dbItemMock } from '../../spec/mocks/items'
import { ItemAttributes } from '../Item/Item.types'
import { VIDEO_PATH } from '../Item/utils'
import { AutoCurationService } from './AutoCuration.service'
import { ValidationManifest } from './AutoCuration.types'
import {
  MAX_VALIDATION_MESSAGE_BYTES,
  requestValidation,
  ValidationTooLargeError,
} from './validationQueue'

const mockSend = jest.fn()

jest.mock('@aws-sdk/client-sns', () => ({
  SNSClient: jest.fn(() => ({ send: mockSend })),
  PublishCommand: jest.fn((input) => ({ input })),
}))

const topicArn = 'arn:aws:sns:us-east-1:000000000000:event-driven-sns-local'

// The rules the validator job's parser applies; a request that breaks them is dropped without an answer.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HASH = /^[A-Za-z0-9]{1,128}$/

function isItemPath(path: string): boolean {
  const segments = path.split('/')
  return (
    !path.includes('\\') &&
    !path.startsWith('/') &&
    !/^[a-z]:/i.test(path) &&
    !path.includes('\0') &&
    segments.every(
      (segment) => segment !== '' && segment !== '.' && segment !== '..'
    )
  )
}

function buildManifest(itemCount: number): ValidationManifest {
  return {
    validationId: uuidv4(),
    collectionId: dbCollectionMock.id,
    items: Array.from({ length: itemCount }, () => ({
      itemId: uuidv4(),
      contentHash: 'bafkreiexample123',
      metadata: {} as ValidationManifest['items'][number]['metadata'],
      contents: { 'thumbnail.png': 'bafkreiexample456' },
    })),
  }
}

describe('when requesting a validation on the queue', () => {
  let manifest: ValidationManifest

  beforeEach(() => {
    process.env.AWS_SNS_ARN = topicArn
    manifest = buildManifest(1)
    mockSend.mockResolvedValue({ MessageId: 'aMessageId' })
    jest.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    delete process.env.AWS_SNS_ARN
    jest.clearAllMocks()
    jest.restoreAllMocks()
  })

  it('should publish the builder event with the manifest as metadata and the filter attributes', async () => {
    await requestValidation(manifest)

    expect(mockSend).toHaveBeenCalledTimes(1)
    const {
      input,
    } = ((PublishCommand as unknown) as jest.Mock).mock.results[0].value
    expect(input).toEqual({
      TopicArn: topicArn,
      Message: expect.any(String),
      MessageAttributes: {
        type: { DataType: 'String', StringValue: 'builder' },
        subType: {
          DataType: 'String',
          StringValue: 'collection-validation-requested',
        },
      },
    })
    expect(JSON.parse(input.Message)).toEqual({
      type: 'builder',
      subType: 'collection-validation-requested',
      key: manifest.collectionId,
      timestamp: expect.any(Number),
      metadata: manifest,
    })
  })

  describe('and the topic is not configured', () => {
    beforeEach(() => {
      delete process.env.AWS_SNS_ARN
    })

    it('should reject without publishing', async () => {
      await expect(requestValidation(manifest)).rejects.toThrow(
        'AWS_SNS_ARN is not configured'
      )
      expect(mockSend).not.toHaveBeenCalled()
    })
  })

  describe('and the message is over the size limit', () => {
    beforeEach(() => {
      manifest.items[0].metadata = ({
        description: 'a'.repeat(MAX_VALIDATION_MESSAGE_BYTES),
      } as unknown) as ValidationManifest['items'][number]['metadata']
    })

    it('should reject with a too large error carrying the size, without publishing', async () => {
      const error = await requestValidation(manifest).catch((e) => e)

      expect(error).toBeInstanceOf(ValidationTooLargeError)
      expect(error.bytes).toBeGreaterThan(MAX_VALIDATION_MESSAGE_BYTES)
      expect(mockSend).not.toHaveBeenCalled()
    })
  })

  describe('and the manifest has more items than the job accepts', () => {
    beforeEach(() => {
      manifest = buildManifest(51)
    })

    it('should reject with a too large error without publishing', async () => {
      const error = await requestValidation(manifest).catch((e) => e)

      expect(error).toBeInstanceOf(ValidationTooLargeError)
      expect(error.itemCount).toBe(51)
      expect(mockSend).not.toHaveBeenCalled()
    })
  })

  describe('and the manifest has fifty items', () => {
    beforeEach(() => {
      manifest = buildManifest(50)
    })

    it('should publish it', async () => {
      await requestValidation(manifest)

      expect(mockSend).toHaveBeenCalledTimes(1)
    })
  })
})

describe('when building the manifest of a collection', () => {
  let items: ItemAttributes[]

  beforeAll(() => {
    process.env.CHAIN_NAME = 'Sepolia'
  })

  afterAll(() => {
    delete process.env.CHAIN_NAME
  })

  beforeEach(() => {
    items = [
      {
        ...dbItemMock,
        id: uuidv4(),
        local_content_hash:
          'bafkreihjvnr3wj6s3fk4ypmlqlz5s3ugt6t3cmbjsewnkc2axdvmuvexfu',
        contents: {
          ...dbItemMock.contents,
          'female/F_3LAU_Hat_Blue.glb':
            'bafkreigkb6emxd5ckxuoh5kv7xg4ocbtxwfngnbjqkhzzzgofkatyvtcqi',
          [VIDEO_PATH]:
            'bafkreidnozm5lnmmtovc7pxfjwiyqklb7l3pn2r3o4cn3nyuqvudhgsvsq',
        },
      },
      { ...dbItemMock, id: uuidv4(), local_content_hash: 'QmLocalHash123' },
    ]
  })

  it('should produce a request the validator job parses', async () => {
    const manifest = await new AutoCurationService().buildManifest(
      uuidv4(),
      dbCollectionMock,
      items
    )

    expect(manifest.validationId).toMatch(UUID)
    expect(manifest.collectionId).toMatch(UUID)
    expect(manifest.items.length).toBeGreaterThanOrEqual(1)
    expect(manifest.items.length).toBeLessThanOrEqual(50)
    for (const item of manifest.items) {
      expect(item.itemId).toMatch(UUID)
      expect(item.contentHash).toMatch(HASH)
      expect(typeof item.metadata).toBe('object')
      const files = Object.entries(item.contents)
      expect(files.length).toBeGreaterThanOrEqual(1)
      expect(files.length).toBeLessThanOrEqual(100)
      for (const [path, hash] of files) {
        expect({ path, valid: isItemPath(path) }).toEqual({
          path,
          valid: true,
        })
        expect(hash).toMatch(HASH)
      }
    }
  })

  it('should leave the video out of the contents', async () => {
    const manifest = await new AutoCurationService().buildManifest(
      uuidv4(),
      dbCollectionMock,
      items
    )

    expect(Object.keys(manifest.items[0].contents)).not.toContain(VIDEO_PATH)
  })
})
