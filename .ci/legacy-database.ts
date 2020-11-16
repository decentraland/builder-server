// THIS FILE EXISTS FOR COMPATIBILITY REASONS

import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'
import { env } from 'dcl-ops-lib/domain'

export function database(
  serviceName: string,
  extraOptions?: {
    engine?: string
    instanceClass?: aws.rds.InstanceType
    allocatedStorage?: number | string
  }
) {
  const config = new pulumi.Config()
  const dbName = serviceName + '_' + env
  const dbUsername = serviceName
  config.require('db-password')
  const dbPassword = config.getSecret('db-password')

  // TODO: Add Security based on VPC security group names
  // const securityGroups = createSecurityGroupsForDB(
  //   serviceName,
  //   extraOptions?.engine ? getPortForEngine(extraOptions.engine!) : 5432
  // );

  const engine =
    extraOptions && extraOptions.engine ? extraOptions.engine! : 'postgres'
  // Create a new database, using the subnet and cluster groups.
  const db = new aws.rds.Instance(serviceName + '-' + env, {
    engine,
    instanceClass:
      extraOptions && extraOptions.instanceClass !== undefined
        ? extraOptions.instanceClass!
        : aws.rds.InstanceTypes.T2_Small,
    allocatedStorage:
      extraOptions && extraOptions.allocatedStorage !== undefined
        ? (extraOptions.allocatedStorage! as any)
        : 10,
    name: dbName,
    username: dbUsername,
    password: dbPassword,
    skipFinalSnapshot: true,
  })

  // Assemble a connection string for the db service.
  return {
    connectionString: pulumi.interpolate`${engine}://${dbUsername}:${dbPassword}@${db.endpoint}/${dbName}?sslmode=disable`,
    dbPassword,
    db,
  }
}
