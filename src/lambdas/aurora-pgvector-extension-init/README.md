# Aurora pgvector Extension Initialization Lambda

This Lambda function initializes the pgvector extension and creates a vector table in an Aurora PostgreSQL database.

## Changes Made

The function has been updated to extract the table name from event headers instead of environment variables, providing better flexibility and security.

## Input Format

The Lambda function expects the table name to be provided in the event headers using the `x-table-name` header.

### Example Event

```json
{
  "headers": {
    "x-table-name": "document_embeddings",
    "Content-Type": "application/json"
  },
  "body": "{}",
  "httpMethod": "POST",
  "path": "/init-vector-table"
}
```

## Table Name Validation

The function validates table names according to PostgreSQL naming conventions:

- Must start with a letter or underscore
- Can contain only letters, numbers, and underscores
- Must be 1-63 characters long
- Cannot be a reserved PostgreSQL keyword

### Valid Table Names

- `document_embeddings`
- `user_vectors`
- `_temp_vectors`
- `vectors_2024`

### Invalid Table Names

- `1vectors` (starts with number)
- `vector-table` (contains hyphen)
- `select` (reserved keyword)
- `very_long_table_name_that_exceeds_sixty_three_characters_limit` (too long)

## Environment Variables Required

- `DB_NAME`: Database name
- `DB_USER`: Database username
- `DB_HOST`: Database host
- `DB_PORT`: Database port
- `DB_PASSWORD`: Database password
- `EMBEDDING_MODEL_DIMENSIONS`: Dimensions of the embedding model
- `PGVECTOR_DRIVER`: Database driver (optional, defaults to 'psycopg')

## Response Format

### Success Response (200)

```json
{
  "statusCode": 200,
  "body": "Successfully created vector table 'document_embeddings' with pgvector extension."
}
```

### Validation Error (400)

```json
{
  "statusCode": 400,
  "body": "Validation error: Invalid table name 'invalid-table'. Table names must start with a letter or underscore, contain only alphanumeric characters and underscores, be 1-63 characters long, and not be a reserved keyword."
}
```

### Database Error (400)

```json
{
  "statusCode": 400,
  "body": "Database credentials error: Some database credentials missing. Present: ['DB_NAME', 'DB_USER'], Missing: ['DB_HOST', 'DB_PORT', 'DB_PASSWORD', 'EMBEDDING_MODEL_DIMENSIONS']"
}
```

### Server Error (500)

```json
{
  "statusCode": 500,
  "body": "Failed to create vector table with pgvector extension."
}
```

## Testing

You can test the function using the provided `test_event_example.json` file:

```bash
aws lambda invoke \
  --function-name your-function-name \
  --payload file://test_event_example.json \
  response.json
```

## Security

- Database credentials are encrypted using KMS
- Table names are validated to prevent SQL injection
- Reserved keywords are blocked to prevent conflicts
- Input validation uses AWS Lambda Powertools for robust schema validation
