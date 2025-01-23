import { Duration, NestedStack, NestedStackProps, SecretValue } from "aws-cdk-lib";
import { AwsAuroraPgvectorExtensionCreatorBaseStackProps } from "./AwsAuroraPgvectorExtensionCreatorStackProps";
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { SubnetSelection } from 'aws-cdk-lib/aws-ec2';
import { parseVpcSubnetType } from '../utils/vpc-type-parser';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as path from 'path';
import { PythonFunction } from '@aws-cdk/aws-lambda-python-alpha';
import { Architecture } from "aws-cdk-lib/aws-lambda";
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as kms from 'aws-cdk-lib/aws-kms';

export interface AwsAuroraPgvectorExtensionCreatorNestedStackProps extends NestedStackProps, AwsAuroraPgvectorExtensionCreatorBaseStackProps {
    /** Username for RDS database access */
    readonly rdsUsername: string;
    /** Password for RDS database access */
    readonly rdsPassword: string;
    /** Name of the default database to be created */
    readonly rdsDatabaseName: string;
    /** Port of the Aurora PostgreSQL instance */
    readonly rdsPort: string;
    /** Hostname of the Aurora PostgreSQL instance */
    readonly rdsHost: string;
    /** ID of the security group for the Aurora PostgreSQL instance */
    readonly rdsSecGrpId: string;
    /** Architecture of the Aurora PostgreSQL instance */
    readonly lambdaArchitecture: Architecture;
}

export class AwsAuroraPgvectorExtensionCreatorNestedStack extends NestedStack {
    public readonly rdsPgExtensionInitFn: PythonFunction;

    constructor(scope: Construct, id: string, props: AwsAuroraPgvectorExtensionCreatorNestedStackProps) {
        super(scope, id, props);

        const vpc = ec2.Vpc.fromLookup(this, `${props.resourcePrefix}-VPC-Imported`, {
            vpcId: props.vpcId,
          });
        const vpcSubnetType = parseVpcSubnetType(props.vpcSubnetType);

        // define subnetAttributes as an array of Record<string, string> with subnetId comes from props.vpcPrivateSubnetIds and availabilityZone comes from props.vpcPrivateSubnetAzs
        const subnetAttributes: Record<string, string>[] = props.vpcPrivateSubnetIds.map((subnetId, index) => {
            return {
                subnetId: subnetId,
                availabilityZone: props.vpcPrivateSubnetAzs[index],
                routeTableId: props.vpcPrivateSubnetRouteTableIds[index],
                type: vpcSubnetType,
            };
        });
        console.log('subnetAttributes:', JSON.stringify(subnetAttributes));

        // retrieve subnets from vpc
        const vpcPrivateISubnets: cdk.aws_ec2.ISubnet[] = subnetAttributes.map((subnetAttribute) => {
            return ec2.Subnet.fromSubnetAttributes(this, subnetAttribute.subnetId, {
                subnetId: subnetAttribute.subnetId,
                availabilityZone: subnetAttribute.availabilityZone,
                routeTableId: subnetAttribute.routeTableId,
            });
        });
        const vpcSubnetSelection: SubnetSelection = vpc.selectSubnets({
            subnets: vpcPrivateISubnets,
            availabilityZones: props.vpcPrivateSubnetAzs,
        });

        const lambdaFnSecGrp = new ec2.SecurityGroup(this, `${props.resourcePrefix}-lambdaFnSecGrp`, {
            vpc,
            allowAllOutbound: false,
            description: 'Security group for lambda function',
        });
        lambdaFnSecGrp.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

        const postgresSecGrpID = props.rdsSecGrpId;

        // retrerive the security group for the postgres database
        const postgresSecGrp = ec2.SecurityGroup.fromSecurityGroupId(this, `${props.resourcePrefix}-PostgresSecGrp`, postgresSecGrpID);

        // Allow Lambda to access PostgreSQL
        postgresSecGrp.addIngressRule(
            lambdaFnSecGrp,
            ec2.Port.tcp(parseInt(props.rdsPort)),
            `Allow Lambda to access PostgreSQL via port ${props.rdsPort}.`
        );

        // Allow Lambda to connect to PostgreSQL
        lambdaFnSecGrp.addEgressRule(
            postgresSecGrp,
            ec2.Port.tcp(parseInt(props.rdsPort)),
            `Allow Lambda to connect to PostgreSQL via port ${props.rdsPort}.`
        );

        const lambdaRole = new cdk.aws_iam.Role(this, `${props.resourcePrefix}-rdsPgExtensionInitFn-Role`, {
        assumedBy: new cdk.aws_iam.ServicePrincipal('lambda.amazonaws.com'),
        managedPolicies: [
                cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
                cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole'),
            ],
        });
        lambdaRole.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

        // Create KMS Key for encryption with automatic rotation
        const kmsKey = new kms.Key(this, 'KmsKeyForDbPassword', {
            enabled: true,
            enableKeyRotation: true,
            rotationPeriod: Duration.days(90),
            description: 'Key for encrypting database password,'
        });

        // Create secret for API authorization encrypted with KMS
        const dbPasswordSecret = new secretsmanager.Secret(this, 'DbPasswordSecret', {
            description: 'Database Password',
            secretStringValue: SecretValue.unsafePlainText(props.rdsPassword),
            encryptionKey: kmsKey,
        });

        // Function to initialize the pgvector extension on the RDS instance
        const pgExtensionInitFn = new PythonFunction(this, `${props.resourcePrefix}-rdsPgExtensionInitFn`, {
            runtime: cdk.aws_lambda.Runtime.PYTHON_3_13,
            entry: path.join(__dirname, '../src/lambdas/rds-pg-extension-init'),
            handler: "handler",
            architecture: props.lambdaArchitecture,
            memorySize: 1024,
            timeout: cdk.Duration.seconds(60),
            logGroup: new cdk.aws_logs.LogGroup(this, `${props.resourcePrefix}-rdsPgExtensionInitFn-LogGroup`, {
                logGroupName: `${props.resourcePrefix}-rdsPgExtensionInitFn-LogGroup`,
                removalPolicy: cdk.RemovalPolicy.DESTROY,
                retention: cdk.aws_logs.RetentionDays.ONE_WEEK,
            }),
            environment: {
                DB_NAME: props.rdsDatabaseName,
                DB_USER: props.rdsUsername,
                DB_HOST: props.rdsHost,
                DB_PORT: props.rdsPort,
                DB_PASSWORD_SECRET_NAME: dbPasswordSecret.secretName,
            },
            role: lambdaRole,
            vpc: vpc,
            securityGroups: [lambdaFnSecGrp],
            vpcSubnets: vpcSubnetSelection,
        });
        pgExtensionInitFn.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

        // Grant Lambda permission to decrypt using KMS key
        kmsKey.grantDecrypt(pgExtensionInitFn);

        // Grant Lambda permission to read the secret
        dbPasswordSecret.grantRead(pgExtensionInitFn);

        this.rdsPgExtensionInitFn = pgExtensionInitFn;
    }
}
