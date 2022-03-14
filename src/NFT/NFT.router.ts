import { server } from 'decentraland-server'
import { Request } from 'express'
import { HTTPError, STATUS_CODES } from '../common/HTTPError'
import { Router } from '../common/Router'
import { NFTService } from './NFT.service'

export class NFTRouter extends Router {
  private readonly nftService = new NFTService()

  mount() {
    this.router.get('/nfts', server.handleRequest(this.getNFTs))
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

    // Get nfts from service
    return this.nftService.getNFTs({ owner, first, skip, cursor })
  }
}
