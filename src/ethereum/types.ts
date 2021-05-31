export enum Network {
  MAINNET = 'mainnet',
  ROPSTEN = 'ropsten',
}

export const FACTORY_COLLECTION_CODE_HASH = {
  [Network.MAINNET]: '',
  [Network.ROPSTEN]:
    '0xf80db993258f789573529f80d215588a9b5973d1dcea7663d5822392fb7fd667',
}

export const FACTORY_COLLECTION_ADDRESS = {
  [Network.MAINNET]: '',
  [Network.ROPSTEN]: '0x2A72Ec4241Ac4fBc915ae98aC5a5b01AdE721f4B',
}

export const FORWARDER_CONTRACT_ADDRESS = {
  [Network.MAINNET]: '',
  [Network.ROPSTEN]: '0x71e56Ad57eca3fAAe5077b7F9ea731a25785fF92',
}
