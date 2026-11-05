'use strict';

// Idempotent bootstrap of the jump relay user. Everything runs with args-as-arrays
// (execFileSync) — no shell interpolation of env-derived values. Safe to run on every
// startup: each step either no-ops or fixes drift (e.g. someone deleted the user).

const { execFileSync } = require('child_process');
const fs = require('fs');
const log = require('./log');

const SSH_DIR_MODE = 0o700;
const AUTH_KEYS_MODE = 0o600;

function userExists(user) {
  try {
    execFileSync('id', [user], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function run(cmd, args) {
  return execFileSync(cmd, args, { stdio: 'pipe', encoding: 'utf8' }).toString();
}

/**
 * @returns {{userExists: boolean, keyPresent: boolean, options: string}}
 * @throws Error with step context on failure
 */
function bootstrap({ jumpUser, publicKey, keyOptions }) {
  if (!jumpUser) throw new Error('JUMP_USER is not set');
  if (!publicKey) throw new Error('JUMP_PUBLIC_KEY is not set');
  keyOptions = keyOptions || 'restrict,port-forwarding';
  const authLine = `${keyOptions} ${publicKey}`;
  const home = `/home/${jumpUser}`;

  try {
    if (userExists(jumpUser)) {
      log.info(`bootstrap: user '${jumpUser}' already exists`);
    } else {
      run('useradd', ['-m', '-s', '/usr/sbin/nologin', jumpUser]);
      log.info(`bootstrap: user '${jumpUser}' created (shell /usr/sbin/nologin)`);
    }

    const sshDir = `${home}/.ssh`;
    fs.mkdirSync(sshDir, { recursive: true, mode: SSH_DIR_MODE });
    fs.chmodSync(sshDir, SSH_DIR_MODE);
    log.info(`bootstrap: ${sshDir} ready (700)`);

    const keysFile = `${sshDir}/authorized_keys`;
    let existing = '';
    try {
      existing = fs.readFileSync(keysFile, 'utf8');
    } catch {
      /* first run */
    }

    let keyPresent;
    if (existing.includes(publicKey)) {
      keyPresent = true;
      log.info('bootstrap: key line already present (no-op)');
    } else {
      fs.appendFileSync(keysFile, authLine + '\n', { mode: AUTH_KEYS_MODE });
      keyPresent = true;
      log.info(`bootstrap: key line appended with options '${keyOptions}'`);
    }
    fs.chmodSync(keysFile, AUTH_KEYS_MODE);
    run('chown', ['-R', `${jumpUser}:${jumpUser}`, sshDir]);
    log.info(`bootstrap: ownership fixed on ${sshDir}`);

    return { userExists: true, keyPresent, options: keyOptions };
  } catch (error) {
    const stderr = error.stderr ? error.stderr.toString().trim() : '';
    log.error(`bootstrap FAILED: ${error.message}${stderr ? ` | ${stderr}` : ''}`);
    throw error;
  }
}

module.exports = { bootstrap, userExists };
