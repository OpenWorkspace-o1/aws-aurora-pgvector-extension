import { NestedStack, NestedStackProps, SecretValue } from "aws-cdk-lib";
import { Construct } from "constructs";
import { PythonFunction } from '@aws-cdk/aws-lambda-python-alpha';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import { Duration } from 'aws-cdk-lib';
import { AwsAuroraPgvectorExtensionCreatorBaseStackProps } from "./AwsAuroraPgvectorExtensionCreatorStackProps";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { HttpLambdaResponseType } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { HttpLambdaAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';

export interface AwsAuroraPgvectorExtensionEndpointNestedStackProps extends NestedStackProps, AwsAuroraPgvectorExtensionCreatorBaseStackProps {
    readonly rdsPgExtensionInitFn: PythonFunction;
    readonly apiSecretKey: string;
    readonly allowOrigins: string[];
    readonly lambdaArchitecture: lambda.Architecture;
}

export class AwsAuroraPgvectorExtensionEndpointNestedStack extends NestedStack {
    public readonly httpApiUrl: string;

    constructor(scope: Construct, id: string, props: AwsAuroraPgvectorExtensionEndpointNestedStackProps) {
        super(scope, id, props);

        // Create secret for API authorization
        const apiAuthSecret = new secretsmanager.Secret(this, 'ApiAuthSecret', {
            secretName: `${props.resourcePrefix}-auth-key-${props.deployEnvironment}`,
            description: 'API Authorization Secret Key',
            secretStringValue: SecretValue.unsafePlainText(props.apiSecretKey),
        });

        // Create the pre-hook Lambda function (Authorizer)
        const preHookLambda = new PythonFunction(this, 'PreHookLambda', {
            runtime: lambda.Runtime.PYTHON_3_13,
            handler: 'handler',
            entry: path.join(__dirname, '../src/lambdas/pre-hook'),
            architecture: props.lambdaArchitecture,
            timeout: Duration.seconds(5),
            memorySize: 1024,
            environment: {
                API_AUTH_SECRET_NAME: apiAuthSecret.secretName,
            },
            tracing: lambda.Tracing.ACTIVE,
            description: 'This is lambda function to do custom authorization based on $request.header.Authorization key.',
        });

        // Grant the Lambda function permission to read the secret
        apiAuthSecret.grantRead(preHookLambda);

        // Create the Lambda authorizer
        const authorizer = new HttpLambdaAuthorizer('lambdaAuthorizer', preHookLambda, {
            authorizerName: `${props.resourcePrefix}-authorizer`,
            identitySource: ['$request.header.Authorization'],
            responseTypes: [HttpLambdaResponseType.SIMPLE],
        });

        // Create the HTTP API
        const httpApi = new apigatewayv2.HttpApi(this, 'HttpApi', {
            apiName: `${props.resourcePrefix}-api`,
            description: 'HTTP API for CX Web Explorer Service.',
            createDefaultStage: false,
            corsPreflight: {
                allowHeaders: ['Content-Type', 'Authorization'],
                allowMethods: [apigatewayv2.CorsHttpMethod.POST],
                allowOrigins: props.allowOrigins,
                maxAge: Duration.days(1)
            },
        });

        // Create API Stage
        new apigatewayv2.HttpStage(this, 'HttpStageWithProperties', {
            httpApi: httpApi,
            stageName: props.deployEnvironment,
            description: `${props.deployEnvironment} API Stage.`,
            autoDeploy: true,
        });

        // Add routes with the authorizer
        httpApi.addRoutes({
            path: '/activate',
            methods: [apigatewayv2.HttpMethod.POST],
            integration: new HttpLambdaIntegration('mainLambda', props.rdsPgExtensionInitFn),
            authorizer: authorizer,
        });

        this.httpApiUrl = `${httpApi.apiEndpoint}/${props.deployEnvironment}`;
    }
}
