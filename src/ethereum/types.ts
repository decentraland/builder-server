import { ChainName } from '@dcl/schemas'

export const FACTORY_COLLECTION_CODE_HASH: Partial<
  Record<ChainName, string>
> = {
  [ChainName.ETHEREUM_MAINNET]:
    '0x4b1f8521034f9cc96eb813b6209f732f73b24abd7673e0ad5aac8c8c46b5ad9c',
  [ChainName.ETHEREUM_ROPSTEN]:
    '0xf80db993258f789573529f80d215588a9b5973d1dcea7663d5822392fb7fd667',
}

export const FACTORY_COLLECTION_ADDRESS: Partial<Record<ChainName, string>> = {
  [ChainName.ETHEREUM_MAINNET]: '0xB549B2442b2BD0a53795BC5cDcBFE0cAF7ACA9f8',
  [ChainName.ETHEREUM_ROPSTEN]: '0x2A72Ec4241Ac4fBc915ae98aC5a5b01AdE721f4B',
}

export const FORWARDER_CONTRACT_ADDRESS: Partial<Record<ChainName, string>> = {
  [ChainName.ETHEREUM_MAINNET]: '0xBF6755A83C0dCDBB2933A96EA778E00b717d7004',
  [ChainName.ETHEREUM_ROPSTEN]: '0x71e56Ad57eca3fAAe5077b7F9ea731a25785fF92',
}
