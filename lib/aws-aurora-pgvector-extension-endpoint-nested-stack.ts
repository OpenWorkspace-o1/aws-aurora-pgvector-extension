import { NestedStack, NestedStackProps, SecretValue } from "aws-cdk-lib";
import { Construct } from "constructs";
import { PythonFunction } from '@aws-cdk/aws-lambda-python-alpha';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import { Duration } from 'aws-cdk-lib';
import * as cdk from 'aws-cdk-lib';
import { AwsAuroraPgvectorExtensionCreatorBaseStackProps } from "./AwsAuroraPgvectorExtensionCreatorStackProps";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { HttpLambdaResponseType } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { HttpLambdaAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { LogLevel } from "aws-cdk-lib/aws-lambda-nodejs";
import { OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";

export interface AwsAuroraPgvectorExtensionEndpointNestedStackProps extends NestedStackProps, AwsAuroraPgvectorExtensionCreatorBaseStackProps {
    readonly rdsPgExtensionInitFn: PythonFunction;
    readonly apiSecretKey: string;
    readonly allowOrigins: string[];
    readonly lambdaArchitecture: lambda.Architecture;
}

export class AwsAuroraPgvectorExtensionEndpointNestedStack extends NestedStack {
    public readonly httpApiUrl: string;
    public readonly apiStage: string;

    constructor(scope: Construct, id: string, props: AwsAuroraPgvectorExtensionEndpointNestedStackProps) {
        super(scope, id, props);

        // Create KMS Key for encryption with automatic rotation
        const kmsKey = new kms.Key(this, `${props.resourcePrefix}-kmsKeyForApiAuthSecret`, {
            enabled: true,
            enableKeyRotation: true,
            rotationPeriod: Duration.days(90),
            description: 'Key for encrypting API authorization secrets',
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        // Create secret for API authorization encrypted with KMS
        const apiAuthSecret = new secretsmanager.Secret(this, `${props.resourcePrefix}-apiAuthSecret`, {
            description: 'API Authorization Secret Key',
            secretStringValue: SecretValue.unsafePlainText(props.apiSecretKey),
            encryptionKey: kmsKey,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        const lambdaRole = new cdk.aws_iam.Role(this, `${props.resourcePrefix}-apiKeyAuthorizerLambdaRole`, {
            assumedBy: new cdk.aws_iam.ServicePrincipal('lambda.amazonaws.com'),
            managedPolicies: [
                cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
            ],
        });
        lambdaRole.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

        // Create the pre-hook Lambda function (Authorizer)
        const apiKeyAuthorizerLambda = new NodejsFunction(this, `${props.resourcePrefix}-apiKeyAuthorizerLambda`, {
            runtime: cdk.aws_lambda.Runtime.NODEJS_22_X,
            entry: path.join(__dirname, '../src/lambdas/api-key-authorizer/index.ts'),
            handler: 'handler',
            role: lambdaRole,
            timeout: cdk.Duration.seconds(30),
            architecture: props.lambdaArchitecture,
            logGroup: new cdk.aws_logs.LogGroup(this, `${props.resourcePrefix}-authorizerLambdaFn-LogGroup`, {
                logGroupName: `${props.resourcePrefix}-authorizerLambdaFn-LogGroup`,
                removalPolicy: cdk.RemovalPolicy.DESTROY,
                retention: cdk.aws_logs.RetentionDays.ONE_WEEK,
            }),
            environment: {
                API_AUTH_SECRET_NAME: apiAuthSecret.secretName,
            },
            memorySize: 1024,
            bundling: {
                minify: true,
                sourceMap: true,
                sourcesContent: false,
                esbuildVersion: '0.24.2',
                target: 'ES2022',
                format: OutputFormat.ESM,
                forceDockerBundling: true,
                logLevel: LogLevel.DEBUG,
            },
            projectRoot: path.join(__dirname, '../src/lambdas/api-key-authorizer'),
            depsLockFilePath: path.join(__dirname, '../src/lambdas/api-key-authorizer/package-lock.json'),
            description: 'This is lambda function to do custom authorization based on $request.header.Authorization key.'
        });

        // Grant the Lambda function permission to read the secret
        apiAuthSecret.grantRead(apiKeyAuthorizerLambda);

        // Grant Lambda permission to decrypt using KMS key
        kmsKey.grantDecrypt(apiKeyAuthorizerLambda);

        // Create the Lambda authorizer
        const authorizer = new HttpLambdaAuthorizer('lambdaAuthorizer', apiKeyAuthorizerLambda, {
            authorizerName: `${props.resourcePrefix}-authorizer`,
            identitySource: ['$request.header.Authorization'],
            responseTypes: [HttpLambdaResponseType.SIMPLE],
        });

        // Create the HTTP API
        const httpApi = new apigatewayv2.HttpApi(this, `${props.resourcePrefix}-httpApi`, {
            apiName: `${props.resourcePrefix}-httpApi`,
            description: 'HTTP API for CX Web Explorer Service.',
            createDefaultStage: false,
            corsPreflight: {
                allowHeaders: ['Content-Type', 'Authorization'],
                allowMethods: [apigatewayv2.CorsHttpMethod.POST],
                allowOrigins: props.allowOrigins?.length ? props.allowOrigins : ['*'],
                maxAge: Duration.days(1)
            },
        });

        // Create API Stage
        this.apiStage = props.deployEnvironment.replace(/[^a-zA-Z0-9-]/g, '-');
        new apigatewayv2.HttpStage(this, `${props.resourcePrefix}-apiStage`, {
            httpApi: httpApi,
            stageName: this.apiStage,
            description: `${props.deployEnvironment} API Stage.`,
            autoDeploy: true,
        });

        // Add routes with the authorizer
        httpApi.addRoutes({
            path: '/activate',
            methods: [apigatewayv2.HttpMethod.POST],
            integration: new HttpLambdaIntegration(`${props.resourcePrefix}-mainLambda`, props.rdsPgExtensionInitFn),
            authorizer: authorizer,
        });

        this.httpApiUrl = `${httpApi.apiEndpoint}`;
    }
}
