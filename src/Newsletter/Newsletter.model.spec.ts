import nodefetch from 'node-fetch'
import { env } from 'decentraland-commons'
import { Newsletter } from './Newsletter.model'

jest.mock('node-fetch', () => jest.fn())
jest.mock('decentraland-commons', () => ({
  env: {
    get: jest.fn(),
  },
}))

describe('Newsletter', () => {
  beforeEach(() => {
    ;(env.get as jest.Mock).mockReturnValue('mockValue')
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('should subscribe the email successfully', async () => {
    const mockEmail = 'test@example.com'
    const mockResponse = { success: true }
    ;(nodefetch as unknown as jest.Mock).mockResolvedValue({
      json: jest.fn().mockResolvedValue(mockResponse),
    })

    const result = await Newsletter.subscribe(mockEmail)
    expect(result).toEqual(mockResponse)
  })

  it('should return null if the subscription API call results in an error', async () => {
    const mockEmail = 'test@example.com'
    ;(nodefetch as unknown as jest.Mock).mockRejectedValue(new Error('API Error'))

    const result = await Newsletter.subscribe(mockEmail)
    expect(result).toBeNull()
  })

  it('should return null if there is an exception during the subscription', async () => {
    const mockEmail = 'test@example.com'
    ;(nodefetch as unknown as jest.Mock).mockImplementation(() => {
      throw new Error('Exception while fetching')
    })

    const result = await Newsletter.subscribe(mockEmail)
    expect(result).toBeNull()
  })

  it('should delete the email successfully', async () => {
    const mockSubscriptionId = 'testSubscrionId'
    const mockResponse = { success: true }
    ;(nodefetch as unknown as jest.Mock).mockResolvedValue({
      json: jest.fn().mockResolvedValue(mockResponse),
    })

    const result = await Newsletter.deleteSubscription(mockSubscriptionId)
    expect(result).toEqual(mockResponse)
  })

  it('should return null if the delete API call results in an error', async () => {
    const mockSubscriptionId = 'testSubscrionId'
    ;(nodefetch as unknown as jest.Mock).mockRejectedValue(new Error('API Error'))

    const result = await Newsletter.deleteSubscription(mockSubscriptionId)
    expect(result).toBeNull()
  })

  it('should return null if there is an exception during the delete', async () => {
    const mockSubscriptionId = 'testSubscrionId'
    ;(nodefetch as unknown as jest.Mock).mockImplementation(() => {
      throw new Error('Exception while fetching')
    })

    const result = await Newsletter.deleteSubscription(mockSubscriptionId)
    expect(result).toBeNull()
  })

  it('should get the email successfully', async () => {
    const mockSubscriptionId = 'testSubscrionId'
    const mockResponse = { success: true }
    ;(nodefetch as unknown as jest.Mock).mockResolvedValue({
      json: jest.fn().mockResolvedValue(mockResponse),
    })

    const result = await Newsletter.getSubscription(mockSubscriptionId)
    expect(result).toEqual(mockResponse)
  })

  it('should return null if the get API call results in an error', async () => {
    const mockSubscriptionId = 'testSubscrionId'
    ;(nodefetch as unknown as jest.Mock).mockRejectedValue(new Error('API Error'))

    const result = await Newsletter.getSubscription(mockSubscriptionId)
    expect(result).toBeNull()
  })

  it('should return null if there is an exception during the get', async () => {
    const mockSubscriptionId = 'testSubscrionId'
    ;(nodefetch as unknown as jest.Mock).mockImplementation(() => {
      throw new Error('Exception while fetching')
    })

    const result = await Newsletter.getSubscription(mockSubscriptionId)
    expect(result).toBeNull()
  })
})
