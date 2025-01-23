import { NestedStack, NestedStackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { PythonFunction } from '@aws-cdk/aws-lambda-python-alpha';
import { AwsAuroraPgvectorExtensionCreatorBaseStackProps } from "./AwsAuroraPgvectorExtensionCreatorStackProps";

export interface AwsAuroraPgvectorExtensionEndpointNestedStackProps extends NestedStackProps, AwsAuroraPgvectorExtensionCreatorBaseStackProps {
    readonly rdsPgExtensionInitFn: PythonFunction;
}

export class AwsAuroraPgvectorExtensionEndpointNestedStack extends NestedStack {
    constructor(scope: Construct, id: string, props: AwsAuroraPgvectorExtensionEndpointNestedStackProps) {
        super(scope, id, props);
    }
}
