import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AwsAuroraPgvectorExtensionCreatorStackProps } from './AwsAuroraPgvectorExtensionCreatorStackProps';
import { AwsAuroraPgvectorExtensionCreatorNestedStack } from './aws-aurora-pgvector-extension-creator-nested-stack';

export class AwsAuroraPgvectorExtensionCreatorStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AwsAuroraPgvectorExtensionCreatorStackProps) {
    super(scope, id, props);

    const auroraPgvectorExtensionCreatorNestedStack = new AwsAuroraPgvectorExtensionCreatorNestedStack(this, `${props.resourcePrefix}-auroraPgvectorExtensionCreatorNestedStack`, {
      ...props,
    });
  }
}
