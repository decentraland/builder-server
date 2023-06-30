import { String } from 'aws-sdk/clients/codebuild'
import { Request } from 'express'
import {
  ProjectAttributes,
  Project,
  searchableProjectProperties,
  sortableTemplateProperties,
} from '.'
import { AuthRequest } from '../middleware'
import { RequestParameters } from '../RequestParameters'
import { getDefaultEthAddress } from '../AssetPack/utils'
import {
  SearchableModel,
  SearchableParameters,
  SearchableConditions,
} from '../Searchable'

const DEFAULT_ETH_ADDRESS = getDefaultEthAddress()

export class SearchableProject {
  constructor(private req: AuthRequest | Request) {}

  async searchByEthAddress(eth_address: String) {
    const requestParameters = new RequestParameters(this.req)
    const searchableProject = new SearchableModel<ProjectAttributes>(
      Project.tableName
    )
    const parameters = new SearchableParameters<ProjectAttributes>(
      requestParameters
    )
    const conditions = new SearchableConditions<ProjectAttributes>(
      requestParameters,
      { eq: searchableProjectProperties }
    )
    conditions.addExtras('eq', { eth_address })
    conditions.addExtras('eq', { is_deleted: false })

    return searchableProject.search(parameters, conditions)
  }

  async searchByIsTemplate() {
    const requestParameters = new RequestParameters(this.req)
    const searchableProject = new SearchableModel<ProjectAttributes>(
      Project.tableName
    )
    const parameters = new SearchableParameters<ProjectAttributes>(
      requestParameters,
      sortableTemplateProperties
    )
    const conditions = new SearchableConditions<ProjectAttributes>(
      requestParameters,
      { eq: searchableProjectProperties }
    )
    conditions.addExtras('eq', { is_template: true })
    // For now, fetch templates only from the DEFAULT_ETH_ADDRESS
    conditions.addExtras('eq', { eth_address: DEFAULT_ETH_ADDRESS })
    conditions.addExtras('eq', { is_deleted: false })

    return searchableProject.search(parameters, conditions)
  }
}
