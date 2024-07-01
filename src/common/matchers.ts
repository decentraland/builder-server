// DCL: urn:decentraland:{network}:collections-v2:{contract-address}
// TP v1: urn:decentraland:{network}:collections-thirdparty:{third-party-name}:{collection-id}(:{item-id})?
// TP v2: urn:decentraland:{network}:collections-linked-wearables:{third-party-name}:{{linkedCollectionNetwork}:{linkedCollectionAddress}collection-id}:some_asset_id

const network = '(mainnet|goerli|sepolia|matic|mumbai|amoy)'
const address = '0x[a-fA-F0-9]{40}'

const baseMatcher = 'urn:decentraland'
const protocolMatcher =
  '(?<protocol>mainnet|goerli|sepolia|matic|mumbai|amoy|off-chain)'
const typeMatcher =
  '(?<type>collections-v2|collections-thirdparty|collections-linked-wearables)'
const collectionsSuffixMatcher =
  '((?<=collections-v2:)(?<collectionAddress>0x[a-fA-F0-9]{40}))'
const thirdPartyCollectionSuffixMatcher =
  '((?<=collections-thirdparty:)(?<thirdPartyName>[^:|\\s]+)(:(?<thirdPartyCollectionId>[^:|\\s]+)))'
const thirdPartyCollectionV2SuffixMatcher =
  '((?<=collections-linked-wearables:)(?<thirdPartyLinkedCollectionName>[^:|\\s]+)(:(?<linkedCollectionNetwork>mainnet|sepolia|matic|amoy):(?<linkedCollectionContractAddress>0x[a-fA-F0-9]{40})))'
const thirdPartyItemMatcher = `(:?${thirdPartyCollectionSuffixMatcher}|${thirdPartyCollectionV2SuffixMatcher})(:(?<thirdPartyTokenId>[^:|\\s]+))?`
const collectionItemMatcher = `${collectionsSuffixMatcher}(:(?<tokenId>[^:|\\s]+))`

export const matchers = {
  email:
    "[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*",

  network,
  collectionUrn: `${baseMatcher}:${protocolMatcher}:${typeMatcher}:(:?${collectionsSuffixMatcher}|${thirdPartyCollectionSuffixMatcher}|${thirdPartyCollectionV2SuffixMatcher})`,
  itemUrn: `${baseMatcher}:${protocolMatcher}:${typeMatcher}:(:?${collectionItemMatcher}|${thirdPartyItemMatcher})`,
  address,
}
