import { IMetricsComponent } from '@well-known-components/interfaces'
import { validateMetricsDeclaration } from '@well-known-components/metrics'

export const metricDeclarations = {
  dcl_published_collection_forum_post_failed: {
    help: 'Count failed published collection forum posts',
    type: IMetricsComponent.CounterType,
    labelNames: ['forum'],
  },
}

// type assertions
validateMetricsDeclaration(metricDeclarations)
