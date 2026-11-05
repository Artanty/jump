'use strict';

// Bounded in-memory ring + stdout. stdout is captured by journald (systemd unit), so
// `journalctl -u <slot> -f` is the permanent record; /logs serves the recent tail.

const MAX_LINES = 200;
const buffer = [];

function write(level, msg) {
  const line = `${new Date().toISOString()} [${level}] ${msg}`;
  buffer.push(line);
  if (buffer.length > MAX_LINES) buffer.shift();
  process.stdout.write(line + '\n');
}

module.exports = {
  info: (msg) => write('info', msg),
  warn: (msg) => write('warn', msg),
  error: (msg) => write('error', msg),
  tail: () => buffer.join('\n') + '\n',
};
