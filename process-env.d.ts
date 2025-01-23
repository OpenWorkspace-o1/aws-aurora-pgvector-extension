declare module NodeJS {
    interface ProcessEnv {
        [key: string]: string | undefined;
        CDK_DEPLOY_REGION: string;
        ENVIRONMENT: string;
        APP_NAME: string;
        VPC_ID: string;
        OWNER: string;
        VPC_SUBNET_TYPE: string;
        VPC_PRIVATE_SUBNET_IDS: string;
        VPC_PRIVATE_SUBNET_AZS: string;
        VPC_PRIVATE_SUBNET_ROUTE_TABLE_IDS: string;
        RDS_USERNAME: string;
        RDS_PASSWORD: string;
        RDS_DATABASE_NAME: string;
        RDS_PORT: string;
        RDS_HOST: string;
        RDS_SECURITY_GROUP_ID: string;
        ARCHITECTURE: string;
        API_AUTHORIZATION_SECRET_KEY: string;
        ALLOW_ORIGINS: string;
    }
}
