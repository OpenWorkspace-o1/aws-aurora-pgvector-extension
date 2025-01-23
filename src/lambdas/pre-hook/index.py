import os
import hmac
import json
import boto3
import time
from aws_lambda_powertools import Logger
from botocore.config import Config
from secrets import compare_digest

logger = Logger()

def get_secret():
    secret_name = os.getenv('API_AUTH_SECRET_NAME')

    session = boto3.session.Session()
    config = Config(
        retries = dict(
            max_attempts = 3,
            mode = 'exponential'
        )
    )
    client = session.client(
        service_name='secretsmanager',
        config=config
    )
    try:
        get_secret_value_response = client.get_secret_value(
            SecretId=secret_name
        )
        secret_dict = json.loads(get_secret_value_response['SecretString'])
        return secret_dict.get('API_AUTHORIZATION_SECRET_KEY')
    except Exception as e:
        logger.error(f"Error retrieving secret: {str(e)}")
        raise e

# Cache secret with TTL
_secret_cache = {'value': None, 'timestamp': 0}

def get_cached_secret():
    now = time.time()
    # TTL 5 mins
    if not _secret_cache['value'] or (now - _secret_cache['timestamp']) > 300:
        max_retries = 3
        retry_count = 0
        while retry_count < max_retries:
            try:
                _secret_cache['value'] = get_secret()
                _secret_cache['timestamp'] = now
                break
            except Exception as e:
                retry_count += 1
                logger.error(f"Failed to refresh secret (attempt {retry_count}/{max_retries}): {e}")
                if retry_count == max_retries and _secret_cache['value']:
                    return _secret_cache['value']
                elif retry_count == max_retries:
                    # Re-raise if no cached value exists
                    raise e
    return _secret_cache['value']

# Get the secret token with caching
secretToken = get_cached_secret()

def lambda_handler(event, context):
    '''
    Check more detail at: https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-lambda-authorizer.html
    Typescript example: https://github.com/aws/aws-cdk/blob/main/packages/%40aws-cdk-testing/framework-integ/test/aws-apigatewayv2-authorizers/test/auth-handler/index.ts
    '''
    response = {
        "isAuthorized": False,
    }

    try:
        auth_header = event.get("headers", {}).get("Authorization")
        if not auth_header:
            logger.error("Missing Authorization header.")
            return response

        if compare_digest(auth_header, secretToken):
            response = {
                "isAuthorized": True
            }
            logger.info('allowed')
            return response
        else:
            logger.error('denied')
            return response
    except BaseException:
        logger.error('denied')
        return response
