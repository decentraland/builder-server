import { ethers } from 'ethers'
import { _TypedDataEncoder } from '@ethersproject/hash'
import { TypedDataDomain, TypedDataField } from '@ethersproject/abstract-signer'
import { SignatureLike } from '@ethersproject/bytes'
import { utils } from 'decentraland-commons'
import {
  ContractData,
  getContract,
  ContractName,
} from 'decentraland-transactions'
import { Bridge } from '../ethereum/api/Bridge'
import {
  collectionAPI,
  CollectionQueryFilters,
} from '../ethereum/api/collection'
import { getMappedChainIdForCurrentChainName } from '../ethereum/utils'
import { ItemCuration } from '../Curation/ItemCuration'
import {
  decodeTPCollectionURN,
  getDecentralandCollectionURN,
  getThirdPartyCollectionURN,
  hasTPCollectionURN,
  isTPCollection,
} from '../utils/urn'
import { CurationStatusFilter } from '../Curation'
import { Cheque } from '../SlotUsageCheque'
import { CollectionAttributes, FullCollection } from './Collection.types'
import { UnpublishedCollectionError } from './Collection.errors'

/**
 * Converts a collection retrieved from the DB into a "FullCollection".
 *
 * @param dbCollection - The "FullCollection" to be converted into a DB collection.
 */
export function toFullCollection(
  dbCollection: CollectionAttributes
): FullCollection {
  const { third_party_id, urn_suffix, contract_address } = dbCollection

  return {
    ...utils.omit(dbCollection, ['urn_suffix', 'third_party_id']),
    urn:
      third_party_id && urn_suffix
        ? getThirdPartyCollectionURN(third_party_id, urn_suffix)
        : getDecentralandCollectionURN(contract_address!),
  }
}

/**
 * Converts a "FullCollection" into a collection that can be inserted into the
 * collection's database.
 *
 * @param collection - The "FullCollection" to be converted into a DB collection.
 */
export function toDBCollection(
  collection: FullCollection
): CollectionAttributes {
  const isTP = hasTPCollectionURN(collection)
  const decodedURN = isTP
    ? decodeTPCollectionURN(collection.urn!)
    : { urn_suffix: null, third_party_id: null }

  let urn_suffix = decodedURN.urn_suffix
  let third_party_id = decodedURN.third_party_id
  let eth_address = isTP ? '' : collection.eth_address
  let contract_address = isTP ? null : collection.contract_address
  let salt = isTP ? '' : collection.salt

  return {
    ...utils.omit(collection, ['urn', 'lock', 'created_at', 'updated_at']),
    urn_suffix,
    eth_address,
    contract_address,
    third_party_id,
    salt,
  }
}

/**
 * Will return a collection by merging the collection present in the database and the remote counterpart.
 * For standard collections, the remote collection will be fetched from thegraph, if it's not present it'll throw.
 * For TP collections, the remote collection is fetched from the Catalyst, if it's not present it'll throw
 */
export async function getMergedCollection(
  dbCollection: CollectionAttributes
): Promise<CollectionAttributes> {
  let mergedCollection: CollectionAttributes

  if (isTPCollection(dbCollection)) {
    const lastItemCuration = await ItemCuration.findLastByCollectionId(
      dbCollection.id
    )

    if (!lastItemCuration) {
      throw new UnpublishedCollectionError(dbCollection.id)
    }

    mergedCollection = Bridge.mergeTPCollection(dbCollection, lastItemCuration)
  } else {
    const remoteCollection = await collectionAPI.fetchCollection(
      dbCollection.contract_address!
    )

    if (!remoteCollection) {
      throw new UnpublishedCollectionError(dbCollection.id)
    }

    mergedCollection = Bridge.mergeCollection(dbCollection, remoteCollection)
  }

  return mergedCollection
}

async function buildChequeSignatureData(
  cheque: Cheque,
  thirdPartyId: string
): Promise<{
  domain: TypedDataDomain
  types: Record<string, Array<TypedDataField>>
  values: Record<string, any>
  signature: SignatureLike
}> {
  const { signature, qty, salt } = cheque
  const chainId = getMappedChainIdForCurrentChainName()
  const thirdPartyContract: ContractData = getContract(
    ContractName.ThirdPartyRegistry,
    chainId
  )
  const domain = {
    name: thirdPartyContract.name,
    verifyingContract: thirdPartyContract.address,
    version: thirdPartyContract.version,
    salt: ethers.utils.hexZeroPad(ethers.utils.hexlify(chainId), 32),
  }
  const types = {
    ConsumeSlots: [
      { name: 'thirdPartyId', type: 'string' },
      { name: 'qty', type: 'uint256' },
      { name: 'salt', type: 'bytes32' },
    ],
  }
  const values = {
    thirdPartyId,
    qty,
    salt,
  }

  return {
    domain,
    types,
    values,
    signature,
  }
}

export async function getChequeMessageHash(
  cheque: Cheque,
  thirdPartyId: string
) {
  const textEncoder = new TextEncoder()
  const chequeSignatureData = await buildChequeSignatureData(
    cheque,
    thirdPartyId
  )

  const dataHash = ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ['bytes32', 'bytes32', 'uint256', 'bytes32'],
      [
        ethers.utils.keccak256(
          textEncoder.encode(
            'ConsumeSlots(string thirdPartyId,uint256 qty,bytes32 salt)'
          )
        ),
        ethers.utils.keccak256(textEncoder.encode(thirdPartyId)),
        chequeSignatureData.values.qty,
        chequeSignatureData.values.salt,
      ]
    )
  )

  const domainHash = ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ['bytes32', 'bytes32', 'bytes32', 'address', 'bytes32'],
      [
        ethers.utils.keccak256(
          textEncoder.encode(
            'EIP712Domain(string name,string version,address verifyingContract,bytes32 salt)'
          )
        ),
        ethers.utils.keccak256(
          textEncoder.encode(chequeSignatureData.domain.name!)
        ),
        ethers.utils.keccak256(
          textEncoder.encode(chequeSignatureData.domain.version!)
        ),
        chequeSignatureData.domain.verifyingContract!,
        // Check if the padding is the same
        chequeSignatureData.domain.salt!,
      ]
    )
  )

  const eip191Header = ethers.utils.arrayify('0x1901')
  return ethers.utils.solidityKeccak256(
    ['bytes', 'bytes32', 'bytes32'],
    [eip191Header, domainHash, dataHash]
  )
}

export async function getAddressFromSignature(
  cheque: Cheque,
  thirdPartyId: string
) {
  const chequeSignatureData = await buildChequeSignatureData(
    cheque,
    thirdPartyId
  )

  return ethers.utils.verifyTypedData(
    chequeSignatureData.domain,
    chequeSignatureData.types,
    chequeSignatureData.values,
    chequeSignatureData.signature
  )
}

/**
 * Converts a '/collections' endpoint filter to an object that can be translated to a WHERE condition for the collections graph
 *
 * @param dbCollection - The "FullCollection" to be converted into a DB collection.
 */
export function toRemoteWhereCondition({
  status,
}: {
  status?: CurationStatusFilter
}): CollectionQueryFilters {
  return {
    isApproved: status ? status === CurationStatusFilter.APPROVED : undefined,
  }
}
