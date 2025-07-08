#!/bin/sh

# Generate a unique schema name and user credentials using a timestamp
CURRENT_TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
NEW_SCHEMA_NAME="squid_credits_${CURRENT_TIMESTAMP}"
NEW_DB_USER="squid_credits_user_${CURRENT_TIMESTAMP}"
CREDITS_SERVER_API_READER_USER="credits_server_user"
SQUIDS_PUBLIC_TABLE="squids"

# Get commit hash from environment variable
COMMIT_HASH=${COMMIT_HASH:-local}
echo "Commit Hash: $COMMIT_HASH"

# Check if required environment variables are set
if [ -z "$DB_USER" ] || [ -z "$DB_NAME" ] || [ -z "$DB_PASSWORD" ] || [ -z "$DB_HOST" ] || [ -z "$DB_PORT" ]; then
  echo "Error: Required environment variables are not set."
  echo "Ensure DB_USER, DB_NAME, DB_PASSWORD, DB_HOST, and DB_PORT are set."
  exit 1
fi

# Log the generated variables
echo "Generated schema name: $NEW_SCHEMA_NAME"
echo "Generated user: $NEW_DB_USER"

# Set PGPASSWORD to handle password prompt
export PGPASSWORD=$DB_PASSWORD

# Fetch metadata and extract service name in one command
SERVICE_NAME=$(aws ecs describe-tasks \
  --cluster "$(curl -s $ECS_CONTAINER_METADATA_URI_V4/task | jq -r '.Cluster')" \
  --tasks "$(curl -s $ECS_CONTAINER_METADATA_URI_V4/task | jq -r '.TaskARN' | awk -F'/' '{print $NF}')" \
  --query 'tasks[0].group' --output text | sed 's|service:||')

echo "Service Name: $SERVICE_NAME"

# Check if an indexer with the same service name and commit hash already exists
EXISTING_INDEXER=$(psql -t -A -v ON_ERROR_STOP=1 --username "$DB_USER" --dbname "$DB_NAME" --host "$DB_HOST" --port "$DB_PORT" <<-EOSQL
  SELECT schema, db_user FROM public.indexers 
  WHERE service = '$SERVICE_NAME' AND commit_hash = '$COMMIT_HASH'
  ORDER BY created_at DESC LIMIT 1;
EOSQL
)

if [ -n "$EXISTING_INDEXER" ]; then
  # Existing indexer found, use its schema and user
  echo "Found existing indexer for service $SERVICE_NAME with commit hash $COMMIT_HASH"
  NEW_SCHEMA_NAME=$(echo $EXISTING_INDEXER | cut -d'|' -f1)
  NEW_DB_USER=$(echo $EXISTING_INDEXER | cut -d'|' -f2)
  echo "Resuming with existing schema: $NEW_SCHEMA_NAME"
  echo "Resuming with existing user: $NEW_DB_USER"
else
  # No existing indexer found, create a new schema and user
  echo "No existing indexer found for service $SERVICE_NAME with commit hash $COMMIT_HASH"
  echo "Creating new schema: $NEW_SCHEMA_NAME"
  echo "Creating new user: $NEW_DB_USER"

  # Connect to the database and create the new schema and user
  psql -v ON_ERROR_STOP=1 --username "$DB_USER" --dbname "$DB_NAME" --host "$DB_HOST" --port "$DB_PORT" <<-EOSQL
    CREATE SCHEMA $NEW_SCHEMA_NAME;
    CREATE USER $NEW_DB_USER WITH PASSWORD '$DB_PASSWORD';
    GRANT ALL PRIVILEGES ON SCHEMA $NEW_SCHEMA_NAME TO $NEW_DB_USER;
    GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $NEW_DB_USER;
    ALTER USER $NEW_DB_USER SET search_path TO $NEW_SCHEMA_NAME;

    -- Grant schema usage to reader users
    GRANT USAGE ON SCHEMA $NEW_SCHEMA_NAME TO $CREDITS_SERVER_API_READER_USER;

    -- Make squid_server_user able to grant permissions on objects in this schema
    GRANT $NEW_DB_USER TO $DB_USER;

    -- Set default privileges for tables created by NEW_DB_USER
    ALTER DEFAULT PRIVILEGES FOR ROLE $NEW_DB_USER IN SCHEMA $NEW_SCHEMA_NAME
      GRANT SELECT ON TABLES TO $CREDITS_SERVER_API_READER_USER;

    -- Grant insert/update to squid public table
    GRANT SELECT, INSERT, UPDATE ON TABLE $SQUIDS_PUBLIC_TABLE TO $NEW_DB_USER;

    -- Insert a new record into the indexers table
    INSERT INTO public.indexers (service, schema, db_user, created_at, commit_hash)
    VALUES ('$SERVICE_NAME', '$NEW_SCHEMA_NAME', '$NEW_DB_USER', NOW(), '$COMMIT_HASH');
EOSQL
fi

# Unset PGPASSWORD
unset PGPASSWORD

# Construct the DB_URL with the new user
export DB_URL=postgresql://$NEW_DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME
export DB_SCHEMA=$NEW_SCHEMA_NAME
export CURRENT_SQUID_DB_USER=$NEW_DB_USER
echo "Exported CURRENT_SQUID_DB_USER: $CURRENT_SQUID_DB_USER"
echo "Exported DB_SCHEMA: $DB_SCHEMA"

# Start the processor service
echo "Starting squid services..."
sqd run:credits --node-options=$NODE_OPTIONS

