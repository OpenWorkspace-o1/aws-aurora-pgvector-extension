import os
from aws_lambda_powertools import Logger
from langchain_postgres import PGEngine

LOGGER = Logger()

class PartialDatabaseCredentialsError(Exception):
    """Raised when only some database credentials are provided"""


def _check_database_env_vars():
    """Check that all DB-related environment variables are either set or unset together"""
    db_vars = {
        "DB_NAME": os.environ.get("DB_NAME"),
        "DB_USER": os.environ.get("DB_USER"),
        "DB_HOST": os.environ.get("DB_HOST"),
        "DB_PORT": os.environ.get("DB_PORT"),
        "DB_PASSWORD": os.environ.get("DB_PASSWORD"),
        "EMBEDDING_MODEL_DIMENSIONS": os.environ.get("EMBEDDING_MODEL_DIMENSIONS")
    }

    present_vars = [name for name, value in db_vars.items() if value]
    missing_vars = [name for name, value in db_vars.items() if not value]

    if present_vars and missing_vars:
        raise PartialDatabaseCredentialsError(
            f"Some database credentials missing. Present: {present_vars}, Missing: {missing_vars}"
        )
    return db_vars

def _connection_string_from_db_params(
        driver: str,
        host: str,
        port: int,
        database: str,
        user: str,
        password: str,
    ) -> str:
    """Construct PostgreSQL connection string from individual parameters.

    Args:
        driver: Database driver name (currently only 'psycopg' supported)
        host: Database hostname or IP address
        port: Database port number
        database: Name of target database
        user: Database authentication username
        password: Database authentication password

    Returns:
        str: SQLAlchemy-compatible connection string

    Raises:
        NotImplementedError: If requested driver is not 'psycopg'

    Note:
        Uses psycopg3 driver syntax (postgresql+psycopg://) for SQLAlchemy connections
    """
    if driver != "psycopg":
        raise NotImplementedError("Only psycopg3 driver is supported")
    return f"postgresql+{driver}://{user}:{password}@{host}:{port}/{database}"


@LOGGER.inject_lambda_context
async def handler(event, context):
    """AWS Lambda entry point for initializing PostgreSQL vector extension in RDS Aurora.

    Expects database connection parameters in environment variables:
    - DB_NAME, DB_USER, DB_PASSWORD, DB_HOST, DB_PORT

    Args:
        event: Lambda invocation event (unused)
        context: Lambda execution context (unused)

    Returns:
        dict: Lambda response format with status code and message body

    Raises:
        PartialDatabaseCredentialsError: If incomplete database credentials provided
        Exception: Propagates any errors from extension creation process

    Environment Variables:
        PGVECTOR_DRIVER: Optional override for database driver (default: 'psycopg')
    """

    try:
        # Check database environment variables consistency
        db_vars = _check_database_env_vars()

        connection_string = _connection_string_from_db_params(
            driver=os.environ.get("PGVECTOR_DRIVER", "psycopg"),
            database=db_vars["DB_NAME"],
            user=db_vars["DB_USER"],
            password=db_vars["DB_PASSWORD"],
            host=db_vars["DB_HOST"],
            port=db_vars["DB_PORT"],
        )

        engine = PGEngine.from_connection_string(url=connection_string)
        embedding_dimensions = int(db_vars["EMBEDDING_MODEL_DIMENSIONS"])
        table_name = db_vars["TABLE_NAME"]

        await engine.ainit_vectorstore_table(
            table_name=table_name,
            vector_size=embedding_dimensions,
        )

        LOGGER.info(f"Successfully created vector table with pgvector extension.")
        return {"statusCode": 200, "body": "Successfully created vector table with pgvector extension."}
    except Exception as e:
        LOGGER.error(f"Failed to create vector table with pgvector extension: {e}")
        return {"statusCode": 500, "body": "Failed to create vector table with pgvector extension."}
