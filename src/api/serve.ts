/**
 * Starts `@subsquid/graphql-server` (its own executable, found wherever npm installed it) with every
 * connection pool listening for errors; see `pool-errors.ts`. The command-line flags reach the server
 * unchanged. `.env` is read first, as the server's executable does, so that the logger, which reads its
 * settings when it loads, still sees `SQD_<LEVEL>` and `FORCE_PRETTY_LOGGER` from it.
 */
require('dotenv').config()
require('./pool-errors')
require(require.resolve('@subsquid/graphql-server/bin/run.js'))
