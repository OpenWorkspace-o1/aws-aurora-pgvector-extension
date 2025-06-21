import { SecretsManager } from '@aws-sdk/client-secrets-manager';
import { Logger } from '@aws-lambda-powertools/logger';
import { timingSafeEqual } from 'crypto';
import { APIGatewayRequestAuthorizerEvent } from 'aws-lambda';

const logger = new Logger();

interface SecretCache {
    value: string | null;
    timestamp: number;
}

// Cache secret with TTL
const secretCache: SecretCache = {
    value: null,
    timestamp: 0
};

const getSecret = async (): Promise<string> => {
    const secretName = process.env.API_AUTH_SECRET_NAME;
    if (!secretName) {
        throw new Error('API_AUTH_SECRET_NAME environment variable is not set');
    }
    logger.info('API_AUTH_SECRET_NAME', { secretName });

    const secretsManagerClient = new SecretsManager({
        maxAttempts: 3,
        retryMode: 'standard'
    });

    try {
        const response = await secretsManagerClient.getSecretValue({ SecretId: secretName });
        if (!response.SecretString) {
            throw new Error('Secret value is empty');
        }
        return response.SecretString;
    } catch (error) {
        logger.error('Error retrieving secret:', { error });
        throw error;
    }
};

const getCachedSecret = async (): Promise<string> => {
    const now = Date.now();
    // TTL 5 mins
    if (!secretCache.value || (now - secretCache.timestamp) > 300000) {
        const maxRetries = 3;
        let retryCount = 0;

        while (retryCount < maxRetries) {
            try {
                secretCache.value = await getSecret();
                secretCache.timestamp = now;
                break;
            } catch (error) {
                retryCount++;
                logger.error(`Failed to refresh secret (attempt ${retryCount}/${maxRetries}):`, { error });

                if (retryCount === maxRetries && secretCache.value) {
                    return secretCache.value;
                } else if (retryCount === maxRetries) {
                    throw error;
                }
            }
        }
    }
    return secretCache.value!;
};

export const handler = async (event: APIGatewayRequestAuthorizerEvent): Promise<{ isAuthorized: boolean }> => {
    const response = {
        isAuthorized: false
    };

    try {
        const authHeader = event.headers?.['Authorization'] || event.headers?.['authorization'];
        if (!authHeader) {
            logger.error('Missing Authorization header.');
            return response;
        }

        const secretToken = await getCachedSecret();

        // Use timing-safe comparison
        if (authHeader.length === secretToken.length &&
            timingSafeEqual(Buffer.from(authHeader), Buffer.from(secretToken))) {
            logger.info('allowed');
            return { isAuthorized: true };
        } else {
            logger.error('denied');
            return response;
        }
    } catch (error) {
        logger.error('denied', { error });
        return response;
    }
};
