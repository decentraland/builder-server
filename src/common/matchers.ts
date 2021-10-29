// DCL: urn:decentraland:{network}:collections-v2:{contract-address}
// TPW: urn:decentraland:{network}:collections-thirdparty:{third-party-name}:{collection-id}(:{item-id})?

const network = '(mainnet|ropsten|matic|mumbai)'
const address = '0x[a-fA-F0-9]{40}'
const urnSlot = '[^:|\\s]+'
const baseURN = `urn:decentraland:${network}`

const dclIdentifier = 'collections-v2'
const tpwIdentifier = `collections-thirdparty:${urnSlot}`

const dclSuffix = `${dclIdentifier}:${address}`
const tpwSuffix = `${tpwIdentifier}:${urnSlot}`

export const matchers = {
  email:
    "[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*",

  network,
  urnSlot,
  address,
  baseURN,

  dclIdentifier,
  tpwIdentifier,

  dclSuffix,
  tpwSuffix,

  urn: `${baseURN}:(?:${tpwSuffix}|${dclSuffix})`,
}
