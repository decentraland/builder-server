import { Request, Response, NextFunction } from 'express'
import { validate as validateUuid } from 'uuid'
import { ethers } from 'ethers'
import { server } from 'decentraland-server'
import { STATUS_CODES } from '../common/HTTPError'
import { Collection, CollectionAttributes } from '../Collection'

export function withCollectionExists(param = 'id') {
  return async (req: Request, res: Response, next: NextFunction) => {
    const idOrContractAddress = server.extractFromReq(req, param)

    // Validate that the parameter is either a UUID or a valid Ethereum address
    if (
      !validateUuid(idOrContractAddress) &&
      !ethers.utils.isAddress(idOrContractAddress)
    ) {
      res
        .status(STATUS_CODES.badRequest)
        .json(
          server.sendError(
            { idOrContractAddress },
            `Invalid collection ID or contract address format: ${idOrContractAddress}`
          )
        )
      return
    }

    // Determine if we're dealing with a UUID (collection ID) or contract address
    const isContractAddress = ethers.utils.isAddress(idOrContractAddress)

    if (isContractAddress) {
      // If it's a contract address, find the collection by contract address
      const contractAddress = idOrContractAddress.toLowerCase()
      const collection = await Collection.findOne<CollectionAttributes>({
        contract_address: contractAddress,
      })

      if (!collection) {
        res
          .status(STATUS_CODES.notFound)
          .json(
            server.sendError(
              { contractAddress },
              `Collection not found for the provided contract address: ${contractAddress}`
            )
          )
        return
      }

      // Store the collection ID in the request for later use
      req.params.id = collection.id
    } else {
      // It's a UUID, validate it exists
      const count = await Collection.count({ id: idOrContractAddress })
      if (count <= 0) {
        res
          .status(STATUS_CODES.notFound)
          .json(
            server.sendError(
              { id: idOrContractAddress, tableName: Collection.tableName },
              `Couldn't find "${idOrContractAddress}" on ${Collection.tableName}`
            )
          )
        return
      }

      // Store the collection ID in the request for later use
      req.params.id = idOrContractAddress
    }

    next()
  }
}
