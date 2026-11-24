import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import './pool-errors'

const pg = require('pg')
const terminated = () => Object.assign(new Error('terminating connection due to administrator command'), { code: '57P01' })

test('a pool created after the preload outlives an error on an idle connection', async () => {
  const pool = new pg.Pool()
  assert.doesNotThrow(() => pool.emit('error', terminated()))
  await pool.end()
})

test('a connection the pool opens outlives an error while it runs a query', async () => {
  const pool = new pg.Pool()
  const client = new EventEmitter()
  pool.emit('connect', client)
  assert.equal(client.listenerCount('error'), 1)
  assert.doesNotThrow(() => client.emit('error', terminated()))
  await pool.end()
})

// Built through the installed server, so an upgrade that stops building its pool from `pg.Pool` fails here.
test('the pool the GraphQL server builds outlives an error on an idle connection', async () => {
  const { Server } = require('@subsquid/graphql-server/lib/server')
  const pool = await new Server({}).createPgPool({})
  assert.equal(pool.listenerCount('error'), 1)
  assert.doesNotThrow(() => pool.emit('error', terminated()))
  await pool.end()
})

test('the pool keeps the options it is built with, and one error listener', async () => {
  const pool = new pg.Pool({ max: 3, min: 2 })
  assert.equal(pool.options.max, 3)
  assert.equal(pool.options.min, 2)
  assert.equal(pool.listenerCount('error'), 1)
  await pool.end()
})
