import { server } from 'decentraland-server'
import { Request } from 'express'
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
    let owner: string | undefined
    let first: number | undefined
    let skip: number | undefined
    let cursor: string | undefined

    // Parse and validate query parameters
    const { query } = req

    // Owner param
    if (query.owner) {
      owner = query.owner.toString()
    }

    // First param
    if (query.first) {
      first = +query.first

      if (Number.isNaN(first)) {
        throw new HTTPError(
          'first is not a number',
          { first: query.first },
          STATUS_CODES.badRequest
        )
      }

      if (first < 0) {
        throw new HTTPError(
          'first must be a positive number',
          { first: query.first },
          STATUS_CODES.badRequest
        )
      }
    }

    // Skip param
    if (query.skip) {
      skip = +query.skip

      if (Number.isNaN(skip)) {
        throw new HTTPError(
          'skip is not a number',
          { skip: query.skip },
          STATUS_CODES.badRequest
        )
      }

      if (skip < 0) {
        throw new HTTPError(
          'skip must be a positive number',
          { skip: query.skip },
          STATUS_CODES.badRequest
        )
      }

      if (!first) {
        throw new HTTPError(
          'skip requires first to be provided',
          { first: query.skip },
          STATUS_CODES.badRequest
        )
      }
    }

    // Cursor param
    if (query.cursor) {
      cursor = query.cursor.toString()
    }

    let nfts: GetNFTsResponse

    // Get NFTs from service
    try {
      nfts = await this.nftService.getNFTs({ owner, first, skip, cursor })
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
    const { contractAddress, tokenId } = req.params

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
