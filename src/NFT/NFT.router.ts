import { server } from 'decentraland-server'
import { Request } from 'express'
import Ajv from 'ajv'
import { HTTPError, STATUS_CODES } from '../common/HTTPError'
import { Router } from '../common/Router'
import { NFTService } from './NFT.service'
import { GetNFTsResponse, NFT } from './NFT.types'

export class NFTRouter extends Router {
  private readonly nftService = new NFTService()

  mount() {
    this.router.get('/nfts', server.handleRequest(this.getNFTs))
    this.router.get(
      '/nfts/:contractAddress/:tokenId',
      server.handleRequest(this.getNFT)
    )
  }

  private getNFTs = async (req: Request) => {
    // Parse and validate query parameters
    const { query } = req

    const ajv = new Ajv({ coerceTypes: true })

    const isValid = ajv.validate(
      {
        type: 'object',
        properties: {
          owner: {
            type: 'string',
            pattern: '^0x[a-fA-F0-9]{40}$',
          },
          first: {
            type: 'number',
            minimum: 1,
          },
          skip: {
            type: 'number',
            minimum: 0,
          },
          cursor: {
            type: 'string',
          },
        },
        dependencies: {
          skip: ['first'],
        },
      },
      query
    )

    if (!isValid) {
      const error = ajv.errors![0]

      throw new HTTPError(
        error.message!,
        { dataPath: error.dataPath },
        STATUS_CODES.badRequest
      )
    }

    let nfts: GetNFTsResponse

    // Get NFTs from service
    try {
      nfts = await this.nftService.getNFTs({
        owner: query.owner?.toString(),
        first: query.first ? +query.first : undefined,
        skip: query.skip ? +query.skip : undefined,
        cursor: query.cursor?.toString(),
      })
    } catch (e) {
      throw new HTTPError(
        'Failed to fetch NFTs from external sources',
        {},
        STATUS_CODES.error
      )
    }

    return nfts
  }

  private getNFT = async (req: Request) => {
    const { params } = req

    const ajv = new Ajv()

    const isValid = ajv.validate(
      {
        type: 'object',
        properties: {
          contractAddress: {
            type: 'string',
            pattern: '^0x[a-fA-F0-9]{40}$',
          },
          tokenId: {
            type: 'string',
          },
        },
        required: ['contractAddress', 'tokenId'],
      },
      params
    )

    if (!isValid) {
      const error = ajv.errors![0]

      throw new HTTPError(
        error.message!,
        { dataPath: error.dataPath },
        STATUS_CODES.badRequest
      )
    }

    const { contractAddress, tokenId } = params

    let nft: NFT | undefined

    // Get NFT from service
    try {
      nft = await this.nftService.getNFT({ contractAddress, tokenId })
    } catch (e) {
      throw new HTTPError(
        'Failed to fetch NFT from external sources',
        { contractAddress, tokenId },
        STATUS_CODES.error
      )
    }

    // Map to a 404 error if undefined is returned by the service
    if (!nft) {
      throw new HTTPError(
        'NFT not found',
        { contractAddress, tokenId },
        STATUS_CODES.notFound
      )
    }

    return nft
  }
}
