# AWS Aurora PostgreSQL pgvector Extension Creator

This CDK TypeScript project automates the deployment of pgvector extension on Amazon Aurora PostgreSQL instances, enabling vector similarity search capabilities.

## Project Overview

This project provides an infrastructure-as-code solution to automatically install and configure the pgvector extension on Aurora PostgreSQL databases. It includes secure API endpoints for managing the extension and follows AWS best practices for security and scalability.

## Features

- Automated pgvector extension installation on Aurora PostgreSQL
- Secure API endpoint with Lambda authorizer
- KMS encryption for sensitive data
- Cross-Origin Resource Sharing (CORS) support
- VPC-aware Lambda functions
- Automated secret rotation
- CloudWatch logging integration

## Prerequisites

- Node.js (v18 or later)
- AWS CDK CLI (v2.x)
- AWS CLI configured with appropriate credentials
- Python 3.13 (for Lambda functions)
- An existing Aurora PostgreSQL cluster
- VPC with private subnets

## Project Setup

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Configure environment variables by creating a `.env` file:

```env
# Application Configuration
APP_NAME=your-aurora-pgvector-serverless
CDK_DEPLOY_REGION=eu-west-1
ENVIRONMENT=development
OWNER=your-team-name

# API Configuration
API_AUTHORIZATION_SECRET_KEY=your-secret-key
ALLOW_ORIGINS=*

# Aurora PostgreSQL Configuration
RDS_USERNAME=postgres
RDS_PASSWORD=your_db_password
RDS_DATABASE_NAME=postgres
RDS_PORT=5432
RDS_HOST=your-aurora-cluster-endpoint
RDS_SECURITY_GROUP_ID=sg-xxxxxxxx

# VPC Configuration
VPC_ID=vpc-xxxxxxxx
VPC_SUBNET_TYPE=PRIVATE_WITH_EGRESS  # or PRIVATE_ISOLATED

# Subnet Configuration
VPC_PRIVATE_SUBNET_IDS=subnet-xxx1,subnet-xxx2,subnet-xxx3
VPC_PRIVATE_SUBNET_AZS=eu-west-1a,eu-west-1b,eu-west-1c
VPC_PRIVATE_SUBNET_ROUTE_TABLE_IDS=rtb-xxx1,rtb-xxx2,rtb-xxx3

# Lambda Configuration
ARCHITECTURE=ARM_64  # or X86_64
```

4. Update the stack configuration with your Aurora PostgreSQL details:
   - Database credentials
   - VPC configuration
   - Subnet information
   - Security group settings

## Deployment

Deploy the stack to your AWS account:

```bash
npm run build
npx cdk deploy
```

Common CDK commands:

- `npm run build`   compile typescript to js
- `npm run watch`   watch for changes and compile
- `npm run test`    perform the jest unit tests
- `npx cdk deploy`  deploy this stack to your default AWS account/region
- `npx cdk diff`    compare deployed stack with current state
- `npx cdk synth`   emits the synthesized CloudFormation template

## Output

After successful deployment, the stack outputs:

- API Gateway endpoint URL for managing the pgvector extension
- The endpoint requires authentication using the configured API key
- Use the endpoint with a POST request to `/activate` to install the pgvector extension

## Security

- All sensitive information is stored in AWS Secrets Manager
- KMS encryption for database passwords and API keys
- Lambda authorizer for API endpoint protection
- VPC isolation for Lambda functions
- Automatic secret rotation enabled
