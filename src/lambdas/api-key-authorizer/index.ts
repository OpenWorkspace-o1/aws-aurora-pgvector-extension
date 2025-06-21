import { SecretsManager } from '@aws-sdk/client-secrets-manager';
import { Logger } from '@aws-lambda-powertools/logger';
import { timingSafeEqual } from 'crypto';
import { APIGatewayRequestAuthorizerEvent } from 'aws-lambda';

const logger = new Logger();

interface SecretCache {
    value: string | null;
    timestamp: number;
}

/**
 * In-memory cache for the secret with a Time-To-Live (TTL).
 * @type {SecretCache}
 */
// Cache secret with TTL
const secretCache: SecretCache = {
    value: null,
    timestamp: 0
};

/**
 * Retrieves a secret value from AWS Secrets Manager.
 *
 * It reads the secret name from the `API_AUTH_SECRET_NAME` environment variable.
 * It uses the AWS SDK v3 `SecretsManager` client with a standard retry mode.
 *
 * @returns {Promise<string>} A promise that resolves to the secret string.
 * @throws {Error} Throws an error if the `API_AUTH_SECRET_NAME` environment variable is not set,
 * if the retrieved secret value is empty, or if any other error occurs during the API call to Secrets Manager.
 */
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

/**
 * Retrieves the secret from a local in-memory cache.
 *
 * If the secret is not in the cache or has expired (TTL of 5 minutes),
 * it fetches the secret from AWS Secrets Manager using {@link getSecret} and updates the cache.
 * It implements a retry mechanism (3 attempts) for fetching the secret. If retries fail
 * but an old cached value exists, it will return the old value.
 *
 * @returns {Promise<string>} A promise that resolves to the secret string.
 * @throws {Error} Throws an error if fetching the secret fails after all retries and the cache is empty.
 */
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

/**
 * Lambda handler for an API Gateway request-based authorizer.
 *
 * It validates the 'Authorization' header from the incoming request against a secret token
 * retrieved via {@link getCachedSecret}. For security, it uses a timing-safe comparison
 * to prevent timing attacks.
 *
 * @param {APIGatewayRequestAuthorizerEvent} event The event object from API Gateway, containing request details.
 * @returns {Promise<{ isAuthorized: boolean }>} A promise that resolves to an object indicating if the request is authorized.
 */
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
