import os
from aws_lambda_powertools import Logger
from sqlalchemy import Engine, create_engine
import sqlalchemy

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
    }

    present_vars = [name for name, value in db_vars.items() if value]
    missing_vars = [name for name, value in db_vars.items() if not value]

    if present_vars and missing_vars:
        raise PartialDatabaseCredentialsError(
            f"Some database credentials missing. Present: {present_vars}, Missing: {missing_vars}"
        )
    return db_vars

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
    """AWS Lambda entry point for initializing PostgreSQL vector extension in RDS Aurora.

    Key Responsibilities:
    1. Environment Validation:
       - Verifies complete set of database credentials (DB_NAME, DB_USER, DB_PASSWORD, DB_HOST, DB_PORT)
       - Ensures either all credentials are provided or none (no partial configurations)

    2. Database Operations:
       - Establishes secure connection using SQLAlchemy with psycopg3 driver
       - Creates/updates 'vector' extension using transactional advisory locks to prevent:
         - Concurrent extension modifications
         - Version conflicts during updates
       - Implements idempotent operations (safe for retries)

    3. Event Handling:
       - Designed for CloudWatch Events triggering on RDS cluster lifecycle events
       - Compatible with direct Lambda invocations for manual execution

    Args:
        event (dict): AWS Lambda event payload (not directly used, but required for trigger mechanism)
        context (object): AWS Lambda context metadata (not utilized in current implementation)

    Returns:
        dict: Standardized Lambda response format:
        - Success: {'statusCode': 200, 'body': 'Success message'}
        - Errors: Propagated through exception raising

    Raises:
        PartialDatabaseCredentialsError: If incomplete DB credentials detected
        NotImplementedError: If attempting to use non-psycopg3 database driver
        sqlalchemy.exc.SQLAlchemyError: For database connection/execution errors
        RuntimeError: For extension creation failures

    Environment Variables:
        Required: DB_NAME, DB_USER, DB_PASSWORD, DB_HOST, DB_PORT
        Optional: PGVECTOR_DRIVER (default: 'psycopg' for psycopg3)

    Example Event Pattern (CloudWatch):
        {"source": ["aws.rds"], "detail-type": ["RDS DB Cluster Availability"]}

    Notes:
        - Idempotent: Safe for multiple executions (checks extension state before acting)
        - Locking: Uses pg_advisory_xact_lock with cluster-wide lock identifier
        - Security: Requires IAM permissions for KMS-encrypted secret access
    """

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
