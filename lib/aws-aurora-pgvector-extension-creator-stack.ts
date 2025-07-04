import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AwsAuroraPgvectorExtensionCreatorStackProps } from './AwsAuroraPgvectorExtensionCreatorStackProps';
import { AwsAuroraPgvectorExtensionCreatorNestedStack } from './aws-aurora-pgvector-extension-creator-nested-stack';
import { AwsAuroraPgvectorExtensionEndpointNestedStack } from './aws-aurora-pgvector-extension-endpoint-nested-stack';

export class AwsAuroraPgvectorExtensionCreatorStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AwsAuroraPgvectorExtensionCreatorStackProps) {
    super(scope, id, props);

    const auroraPgvectorExtensionCreatorNestedStack = new AwsAuroraPgvectorExtensionCreatorNestedStack(this, `${props.resourcePrefix}-auroraPgvectorExtensionCreatorNestedStack`, {
      ...props,
      pgvectorDriver: process.env.PGVECTOR_DRIVER!,
      embeddingModelDimensions: process.env.EMBEDDING_MODEL_DIMENSIONS!,
    });

    const auroraPgvectorExtensionEndpointNestedStack = new AwsAuroraPgvectorExtensionEndpointNestedStack(this, `${props.resourcePrefix}-auroraPgvectorExtensionEndpointNestedStack`, {
      ...props,
      rdsPgExtensionInitFn: auroraPgvectorExtensionCreatorNestedStack.rdsPgExtensionInitFn,
      apiSecretKey: process.env.API_AUTHORIZATION_SECRET_KEY!,
      allowOrigins: process.env.ALLOW_ORIGINS!.split(','),
    });

    // Ensure auroraPgvectorExtensionCreatorNestedStack is created before auroraPgvectorExtensionEndpointNestedStack
    auroraPgvectorExtensionEndpointNestedStack.addDependency(auroraPgvectorExtensionCreatorNestedStack);

    // Export the endpoint URL
    new cdk.CfnOutput(this, 'AuroraPgvectorExtensionEndpointUrl', {
      value: `${auroraPgvectorExtensionEndpointNestedStack.httpApiUrl}/${auroraPgvectorExtensionEndpointNestedStack.apiStage}`,
      exportName: `${props.resourcePrefix}-auroraPgvectorExtensionEndpointUrl`,
      description: 'Aurora PGVector Extension Creator Endpoint URL',
    });
  }
}
