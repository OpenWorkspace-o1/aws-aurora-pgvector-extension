import os
from aws_lambda_powertools import Logger
from sqlalchemy import Engine, create_engine
import sqlalchemy


class PartialDatabaseCredentialsError(Exception):
    """Raised when only some database credentials are provided"""


def _check_database_env_vars():
    """Check that all DB-related environment variables are either set or unset together"""
    db_vars = {
        "DB_NAME": os.environ.get("DB_NAME"),
        "DB_USER": os.environ.get("DB_USER"),
        "DB_PASSWORD": os.environ.get("DB_PASSWORD"),
        "DB_HOST": os.environ.get("DB_HOST"),
        "DB_PORT": os.environ.get("DB_PORT"),
    }

    present_vars = [name for name, value in db_vars.items() if value]
    missing_vars = [name for name, value in db_vars.items() if not value]

    if present_vars and missing_vars:
        raise PartialDatabaseCredentialsError(
            f"Some database credentials missing. Present: {present_vars}, Missing: {missing_vars}"
        )
    return db_vars

LOGGER = Logger()

def _create_vector_extension(db_engine: Engine) -> None:
    """Create vector extension in PostgreSQL database with transactional lock"""
    try:
        with db_engine.connect() as conn:
            statement = sqlalchemy.text("""
                DO $$
                BEGIN
                    -- Only proceed if vector extension doesn't exist or needs update
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_extension WHERE extname = 'vector'
                    ) OR (
                        SELECT extversion FROM pg_extension WHERE extname = 'vector'
                    ) < (
                        SELECT default_version FROM pg_available_extensions
                        WHERE name = 'vector'
                    ) THEN

                        -- Use cluster-wide lock number to prevent concurrent migrations
                        PERFORM pg_advisory_xact_lock(pg_catalog.hashtext('vector'));

                        CREATE EXTENSION IF NOT EXISTS vector;
                        ALTER EXTENSION vector UPDATE;
                    END IF;
                EXCEPTION WHEN OTHERS THEN
                    RAISE LOG 'Vector extension migration failed: %', SQLERRM;
                    RAISE;
                END $$;
            """)
            conn.execute(statement)
            conn.commit()
            LOGGER.info("Vector extension created successfully.")
    except Exception as e:
        LOGGER.error(f"Failed to create vector extension: {e}")
        raise Exception(f"Failed to create vector extension: {e}") from e

def _connection_string_from_db_params(
        driver: str,
        host: str,
        port: int,
        database: str,
        user: str,
        password: str,
    ) -> str:
        """Return connection string from database parameters."""
        if driver != "psycopg":
            raise NotImplementedError("Only psycopg3 driver is supported")
        return f"postgresql+{driver}://{user}:{password}@{host}:{port}/{database}"


def handler(event, context):
    """Lambda entry point for handling RDS DDL initialization events.

    Responsibilities:
    - Validates database connection environment variables
    - Creates PostgreSQL vector extension with proper locking
    - Handles CloudWatch Events triggering from RDS cluster creation

    Args:
        event: AWS Lambda event payload containing trigger information
        context: AWS Lambda execution context metadata

    Returns:
        dict: Lambda response format with status code and message body
        Example: {'statusCode': 200, 'body': 'Success message'}

    Raises:
        PartialDatabaseCredentialsError: If incomplete database credentials provided
        Exception: Propagates any errors during extension creation

    Example Event:
        Typically triggered by CloudWatch Events rule matching RDS cluster creation
    """
    LOGGER.info(f"Event: {event}")
    LOGGER.info(f"Context: {context}")

    # Check database environment variables consistency
    db_vars = _check_database_env_vars()

    conn = _connection_string_from_db_params(
        driver=os.environ.get("PGVECTOR_DRIVER", "psycopg"),
        database=db_vars["DB_NAME"],
        user=db_vars["DB_USER"],
        password=db_vars["DB_PASSWORD"],
        host=db_vars["DB_HOST"],
        port=db_vars["DB_PORT"],
    )

    db_engine = create_engine(url=conn, **{})

    _create_vector_extension(db_engine)

    return {"statusCode": 200, "body": "Successfully created vector extension."}
