#!/usr/bin/env node
import 'source-map-support/register';

import * as cdk from 'aws-cdk-lib';
import * as dotenv from 'dotenv';
import { checkEnvVariables } from '../utils/check-environment-variable';

import { ApplyTags } from '../utils/apply-tag';
import { Aspects } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { AwsAuroraPgvectorExtensionCreatorStack } from '../lib/aws-aurora-pgvector-extension-creator-stack';
import { AwsAuroraPgvectorExtensionCreatorStackProps } from '../lib/AwsAuroraPgvectorExtensionCreatorStackProps';
import { parseLambdaArchitectureFromEnv } from '../utils/lambda-architect-parser';

dotenv.config(); // Load environment variables from .env file
const app = new cdk.App();

const appAspects = Aspects.of(app);

// check APP_NAME variable
checkEnvVariables('APP_NAME',
    'CDK_DEPLOY_REGION',
    'ENVIRONMENT',
    'VPC_SUBNET_TYPE',
    'VPC_PRIVATE_SUBNET_IDS',
    'VPC_PRIVATE_SUBNET_AZS',
    'VPC_PRIVATE_SUBNET_ROUTE_TABLE_IDS',
    'OWNER',
    'VPC_ID',
    'RDS_USERNAME',
    'RDS_PASSWORD',
    'RDS_DATABASE_NAME',
    'RDS_PORT',
    'RDS_HOST',
    'RDS_SECURITY_GROUP_ID',
    'ARCHITECTURE',
    'API_AUTHORIZATION_SECRET_KEY',
    'ALLOW_ORIGINS',
    'PGVECTOR_DRIVER',
    'EMBEDDING_MODEL_DIMENSIONS',
);

const { CDK_DEFAULT_ACCOUNT: account } = process.env;

const cdkRegion = process.env.CDK_DEPLOY_REGION;
const deployEnvironment = process.env.ENVIRONMENT!;

const appName = process.env.APP_NAME!;
const owner = process.env.OWNER!;

// check best practices based on AWS Solutions Security Matrix
// appAspects.add(new AwsSolutionsChecks());

appAspects.add(new ApplyTags({
    environment: deployEnvironment as 'development' | 'staging' | 'production' | 'feature',
    project: appName,
    owner: owner,
}));

const stackProps: AwsAuroraPgvectorExtensionCreatorStackProps = {
    resourcePrefix: `${appName}-${deployEnvironment}`,
    env: {
        region: cdkRegion,
        account,
    },
    deployRegion: cdkRegion,
    deployEnvironment,
    appName,
    vpcSubnetType: process.env.VPC_SUBNET_TYPE!,
    owner,
    vpcId: process.env.VPC_ID!,
    vpcPrivateSubnetIds: process.env.VPC_PRIVATE_SUBNET_IDS!.split(','),
    vpcPrivateSubnetAzs: process.env.VPC_PRIVATE_SUBNET_AZS!.split(','),
    vpcPrivateSubnetRouteTableIds: process.env.VPC_PRIVATE_SUBNET_ROUTE_TABLE_IDS!.split(','),
    rdsUsername: process.env.RDS_USERNAME!,
    rdsPassword: process.env.RDS_PASSWORD!,
    rdsDatabaseName: process.env.RDS_DATABASE_NAME!,
    rdsPort: process.env.RDS_PORT!,
    rdsHost: process.env.RDS_HOST!,
    rdsSecGrpId: process.env.RDS_SECURITY_GROUP_ID!,
    lambdaArchitecture: parseLambdaArchitectureFromEnv(),
};

new AwsAuroraPgvectorExtensionCreatorStack(app, `${owner}-${deployEnvironment}-AwsAuroraPgvectorExtensionCreatorStack`, {
    ...stackProps,
    stackName: `${owner}-${deployEnvironment}-AwsAuroraPgvectorExtensionCreatorStack`,
    description: `AwsAuroraPgvectorExtensionCreatorStack for ${appName} in ${cdkRegion} ${deployEnvironment}.`,
});

app.synth();
