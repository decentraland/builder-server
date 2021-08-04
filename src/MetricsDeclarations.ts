import { IMetricsComponent } from '@well-known-components/interfaces'
import { validateMetricsDeclaration } from '@well-known-components/metrics'

export const metricDeclarations = {
  dcl_published_collection_forum_post_failed: {
    help: 'Count failed published collection forum post creation',
    type: IMetricsComponent.CounterType,
    labelNames: [],
  },
  dcl_published_collection_forum_post_already_exists: {
    help:
      'Count failed published collection forum creation due to already created forum links',
    type: IMetricsComponent.CounterType,
    labelNames: [],
  },
}

// type assertions
validateMetricsDeclaration(metricDeclarations)
