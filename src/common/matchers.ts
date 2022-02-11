// DCL: urn:decentraland:{network}:collections-v2:{contract-address}
//  TP: urn:decentraland:{network}:collections-thirdparty:{third-party-name}:{collection-id}(:{item-id})?

const network = '(mainnet|ropsten|matic|mumbai)'
const address = '0x[a-fA-F0-9]{40}'
const urnSlot = '[^:|\\s]+'
const baseURN = `urn:decentraland:${network}`

const dclIdentifier = 'collections-v2'
const tpIdentifier = `collections-thirdparty:${urnSlot}`

const dclSuffix = `${dclIdentifier}:${address}`
const tpSuffix = `${tpIdentifier}:${urnSlot}`

export const matchers = {
  email:
    "[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*",

  network,
  urnSlot,
  address,
  baseURN,

  dclIdentifier,
  tpIdentifier,

  dclSuffix,
  tpSuffix,

  urn: `${baseURN}:(?:${tpSuffix}|${dclSuffix})`,
}
