import { IMetricsComponent } from '@well-known-components/interfaces'
import { validateMetricsDeclaration } from '@well-known-components/metrics'

export enum MetricKeys {
  FORUM_POST_FAILED = 'dcl_published_collection_forum_post_failed',
  FORUM_POST_ALREADY_EXISTS = 'dcl_published_collection_forum_post_already_exists',
}

export const metricDeclarations = {
  [MetricKeys.FORUM_POST_FAILED]: {
    help: 'Count failed published collection forum post creation',
    type: IMetricsComponent.CounterType,
    labelNames: [],
  },
  [MetricKeys.FORUM_POST_ALREADY_EXISTS]: {
    help:
      'Count failed published collection forum creation due to already created forum links',
    type: IMetricsComponent.CounterType,
    labelNames: [],
  },
}

export type MetricDeclarations = keyof typeof metricDeclarations

// type assertions
validateMetricsDeclaration(metricDeclarations)
