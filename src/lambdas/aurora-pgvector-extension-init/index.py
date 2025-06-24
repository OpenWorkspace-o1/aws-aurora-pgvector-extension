import os
import re
from aws_lambda_powertools import Logger
from aws_lambda_powertools.utilities.parser import parse_event_headers
from aws_lambda_powertools.utilities.validation import validate_event_headers
from aws_lambda_powertools.utilities.validation.exceptions import SchemaValidationError
from .engine import PGEngine

LOGGER = Logger()

class PartialDatabaseCredentialsError(Exception):
    """Raised when only some database credentials are provided"""

class TableNameValidationError(Exception):
    """Raised when table name validation fails"""

# Schema for validating table name from headers
TABLE_NAME_HEADER_SCHEMA = {
    "type": "object",
    "properties": {
        "headers": {
            "type": "object",
            "properties": {
                "x-table-name": {
                    "type": "string",
                    "pattern": "^[a-zA-Z_][a-zA-Z0-9_]*$",
                    "minLength": 1,
                    "maxLength": 63
                }
            },
            "required": ["x-table-name"]
        }
    },
    "required": ["headers"]
}

def _validate_table_name(table_name: str) -> bool:
    """Validate table name format and constraints.

    Args:
        table_name: The table name to validate

    Returns:
        bool: True if valid, False otherwise

    Note:
        PostgreSQL table names must:
        - Start with a letter or underscore
        - Contain only letters, numbers, and underscores
        - Be 1-63 characters long
        - Not be a reserved keyword
    """
    if not table_name:
        return False

    # Check length
    if len(table_name) > 63:
        return False

    # Check pattern (starts with letter/underscore, contains only alphanumeric and underscore)
    if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', table_name):
        return False

    # Check for reserved PostgreSQL keywords (basic check)
    reserved_keywords = {
        'select', 'from', 'where', 'insert', 'update', 'delete', 'create', 'drop',
        'table', 'index', 'view', 'schema', 'database', 'user', 'password', 'host',
        'port', 'name', 'type', 'size', 'vector', 'extension', 'pgvector'
    }

    if table_name.lower() in reserved_keywords:
        return False

    return True

def _extract_table_name_from_headers(event: dict) -> str:
    """Extract and validate table name from event headers.

    Args:
        event: Lambda event containing headers

    Returns:
        str: Validated table name

    Raises:
        SchemaValidationError: If headers don't match expected schema
        TableNameValidationError: If table name validation fails
    """
    try:
        # Validate event structure and extract headers
        validate_event_headers(event, TABLE_NAME_HEADER_SCHEMA)
        headers = parse_event_headers(event)

        # Extract table name from headers
        table_name = headers.get('x-table-name')

        if not table_name:
            raise TableNameValidationError("Table name header 'x-table-name' is required")

        # Additional validation
        if not _validate_table_name(table_name):
            raise TableNameValidationError(
                f"Invalid table name '{table_name}'. Table names must start with a letter or underscore, "
                f"contain only alphanumeric characters and underscores, be 1-63 characters long, "
                f"and not be a reserved keyword."
            )

        return table_name

    except SchemaValidationError as e:
        LOGGER.error(f"Schema validation error: {e}")
        raise
    except Exception as e:
        LOGGER.error(f"Error extracting table name from headers: {e}")
        raise TableNameValidationError(f"Failed to extract table name from headers: {e}")

def _check_database_env_vars():
    """Check that all DB-related environment variables are either set or unset together"""
    db_vars = {
        "DB_NAME": os.environ.get("DB_NAME"),
        "DB_USER": os.environ.get("DB_USER"),
        "DB_HOST": os.environ.get("DB_HOST"),
        "DB_PORT": os.environ.get("DB_PORT"),
        "DB_PASSWORD": os.environ.get("DB_PASSWORD"),
        "EMBEDDING_MODEL_DIMENSIONS": os.environ.get("EMBEDDING_MODEL_DIMENSIONS"),
        "PGVECTOR_DRIVER": os.environ.get("PGVECTOR_DRIVER")
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
    - DB_NAME, DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, EMBEDDING_MODEL_DIMENSIONS

    Expects table name in event headers:
    - x-table-name: The name of the table to create for vector storage

    Args:
        event: Lambda invocation event containing headers with table name
        context: Lambda execution context (unused)

    Returns:
        dict: Lambda response format with status code and message body

    Raises:
        PartialDatabaseCredentialsError: If incomplete database credentials provided
        SchemaValidationError: If event headers don't match expected schema
        TableNameValidationError: If table name validation fails
        Exception: Propagates any errors from extension creation process

    Environment Variables:
        PGVECTOR_DRIVER: Optional override for database driver (default: 'psycopg')
    """

    try:
        # Extract and validate table name from event headers
        table_name = _extract_table_name_from_headers(event)
        LOGGER.info(f"Extracted table name from headers: {table_name}")

        # Check database environment variables consistency
        db_vars = _check_database_env_vars()

        connection_string = _connection_string_from_db_params(
            driver=db_vars["PGVECTOR_DRIVER"],
            database=db_vars["DB_NAME"],
            user=db_vars["DB_USER"],
            password=db_vars["DB_PASSWORD"],
            host=db_vars["DB_HOST"],
            port=db_vars["DB_PORT"],
        )

        engine = PGEngine.from_connection_string(url=connection_string)
        embedding_dimensions = int(db_vars["EMBEDDING_MODEL_DIMENSIONS"])

        await engine.ainit_vectorstore_table(
            table_name=table_name,
            vector_size=embedding_dimensions,
        )

        LOGGER.info(f"Successfully created vector table '{table_name}' with pgvector extension.")
        return {
            "statusCode": 200,
            "body": f"Successfully created vector table '{table_name}' with pgvector extension."
        }
    except (SchemaValidationError, TableNameValidationError) as e:
        LOGGER.error(f"Validation error: {e}")
        return {
            "statusCode": 400,
            "body": f"Validation error: {str(e)}"
        }
    except PartialDatabaseCredentialsError as e:
        LOGGER.error(f"Database credentials error: {e}")
        return {
            "statusCode": 400,
            "body": f"Database credentials error: {str(e)}"
        }
    except Exception as e:
        LOGGER.error(f"Failed to create vector table with pgvector extension: {e}")
        return {
            "statusCode": 500,
            "body": "Failed to create vector table with pgvector extension."
        }
