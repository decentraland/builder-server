import { String } from 'aws-sdk/clients/codebuild'
import { ProjectAttributes, Project, searchableProjectProperties } from '.'
import { AuthRequest } from '../middleware'
import { RequestParameters } from '../RequestParameters'
import {
  SearchableModel,
  SearchableParameters,
  SearchableConditions,
} from '../Searchable'

export class SearchableProject {
  constructor(private req: AuthRequest) {}

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
}
