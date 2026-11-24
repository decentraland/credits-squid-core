import type { EventEmitter } from 'node:events'
import { createLogger } from '@subsquid/logger'

/**
 * Loaded by `serve.ts` before the GraphQL server.
 *
 * `@subsquid/graphql-server` creates its `pg.Pool` without an `error` listener. When the database ends a
 * connection (an engine upgrade, a restart, a failover, `pg_terminate_backend`), an `error` event nobody
 * listens to ends the process:
 *
 * - an idle connection's error is re-emitted on the pool;
 * - a connection running a query passes the error to that query, then emits it on the client, which the
 *   pool only listens to while the client is idle.
 *
 * With a listener on both, the query still gets its error, and the pool discards the broken connection and
 * opens another one for the next query.
 */

type PoolClass = new (...args: any[]) => EventEmitter
type PgError = Error & { code?: string }

const log = createLogger('sqd:api:pool')
const pg: { Pool: PoolClass } = require('pg')
const Pool = pg.Pool

pg.Pool = class extends Pool {
  constructor(...args: any[]) {
    super(...args)
    this.on('error', (err: PgError) => {
      log.warn({ code: err.code, reason: err.message }, 'an idle database connection failed; the pool opens another one for the next query')
    })
    // Fired once per new connection, so the listener stays on it whether it is idle or running a query.
    // An idle connection's error is logged twice: here and through the pool.
    this.on('connect', (client: EventEmitter) => {
      client.on('error', (err: PgError) => {
        log.warn({ code: err.code, reason: err.message }, 'a database connection failed; the pool discards it')
      })
    })
  }
}
