import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { SubnetSelection } from 'aws-cdk-lib/aws-ec2';
import { AwsAuroraPgvectorExtensionCreatorStackProps } from './AwsAuroraPgvectorExtensionCreatorStackProps';
import { parseVpcSubnetType } from '../utils/vpc-type-parser';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

export class AwsAuroraPgvectorExtensionCreatorStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AwsAuroraPgvectorExtensionCreatorStackProps) {
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

    // allow all traffic from lambdaFnSecGrp to postgresSecGrp via port 5432
    postgresSecGrp.addIngressRule(
        lambdaFnSecGrp,
        ec2.Port.tcp(Number(props.rdsPort)),
        `Allow all traffic from lambdaFnSecGrp to postgresSecGrp via port ${props.rdsPort}.`
    );
  }
}
