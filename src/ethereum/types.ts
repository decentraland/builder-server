// TODO: Use either ChainName or ChainId from @dcl/schemas
export enum Network {
  MAINNET = 'mainnet',
  ROPSTEN = 'ropsten',
}

export const FACTORY_COLLECTION_CODE_HASH = {
  [Network.MAINNET]:
    '0x4b1f8521034f9cc96eb813b6209f732f73b24abd7673e0ad5aac8c8c46b5ad9c',
  [Network.ROPSTEN]:
    '0xf80db993258f789573529f80d215588a9b5973d1dcea7663d5822392fb7fd667',
}

export const FACTORY_COLLECTION_ADDRESS = {
  [Network.MAINNET]: '0xB549B2442b2BD0a53795BC5cDcBFE0cAF7ACA9f8',
  [Network.ROPSTEN]: '0x2A72Ec4241Ac4fBc915ae98aC5a5b01AdE721f4B',
}

export const FORWARDER_CONTRACT_ADDRESS = {
  [Network.MAINNET]: '0xBF6755A83C0dCDBB2933A96EA778E00b717d7004',
  [Network.ROPSTEN]: '0x71e56Ad57eca3fAAe5077b7F9ea731a25785fF92',
}
