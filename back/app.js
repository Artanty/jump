'use strict';

require('dotenv').config();


const express = require('express');
const log = require('./lib/log');
const { bootstrap } = require('./lib/bootstrap');

const PORT = Number(process.env.PORT) || 3100;
const startedAt = Date.now();

let status = null;

if (process.platform !== 'linux') {
  // dev machines have no useradd/systemd; run the http surface only
  log.warn('non-linux host: skipping os bootstrap (dev mode)');
  status = { userExists: false, keyPresent: false, options: process.env.JUMP_KEY_OPTIONS || 'restrict,port-forwarding' };
  status.bootstrappedAt = new Date().toISOString();
} else {
  try {
    status = bootstrap({
      jumpUser: process.env.JUMP_USER,
      publicKey: process.env.JUMP_PUBLIC_KEY,
      keyOptions: process.env.JUMP_KEY_OPTIONS,
    });
    status.bootstrappedAt = new Date().toISOString();
    log.info(`bootstrap ok: user=${process.env.JUMP_USER} keyPresent=${status.keyPresent} options=${status.options}`);
  } catch (error) {
    log.error('exiting: bootstrap failed — see the step log above');
    process.exit(1);
  }
}

const app = express();

app.use((req, res, next) => {
  const t0 = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    log.info(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms.toFixed(1)}ms)`);
  });
  next();
});

app.get('/healthz', (req, res) => res.type('text/plain').send('ok'));

app.get('/status', (req, res) => {
  res.json({
    ok: true,
    user: process.env.JUMP_USER,
    userExists: status.userExists,
    keyPresent: status.keyPresent,
    options: status.options,
    bootstrappedAt: status.bootstrappedAt,
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    node: process.version,
  });
});

app.get('/logs', (req, res) => res.type('text/plain').send(log.tail()));

app.listen(PORT, () => {
  log.info(`jump service listening on :${PORT} (healthz | status | logs)`);
});
# pipeline marker
