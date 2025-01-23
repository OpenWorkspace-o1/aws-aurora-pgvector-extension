import * as lambda from 'aws-cdk-lib/aws-lambda';

export const parseLambdaArchitectureFromEnv = (): lambda.Architecture => {
    const architecture = process.env.ARCHITECTURE;
    if (!architecture) {
        throw new Error('ARCHITECTURE is not set.');
    }
    const acceptedValues = ['ARM_64', 'X86_64'];
    if (!acceptedValues.includes(architecture)) {
        throw new Error(`Invalid ARCHITECTURE value '${architecture}'. Allowed values: ${acceptedValues.join(', ')}`);
    }
    return architecture === 'ARM_64'
        ? lambda.Architecture.ARM_64
        : lambda.Architecture.X86_64;
};
