import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AwsAuroraPgvectorExtensionCreatorStackProps } from './AwsAuroraPgvectorExtensionCreatorStackProps';

export class AwsAuroraPgvectorExtensionCreatorStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AwsAuroraPgvectorExtensionCreatorStackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here

    // example resource
    // const queue = new sqs.Queue(this, 'AwsAuroraPgvectorExtensionCreatorQueue', {
    //   visibilityTimeout: cdk.Duration.seconds(300)
    // });
  }
}
