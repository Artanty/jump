# SETUP — exact commands executed on the VDS (2026-11-05)

Contract: the VDS is administered under a strict no-excess-requests rule — batch work into as
few sessions as possible, never explore beyond the task, ask the owner on any anomaly.
`sshpass` is banned (prior ban history); password sessions go through `expect`, and never for
binary transfers (PTY corrupts them — use keys).

## Session 1 (read-only probe — VDS can reach Timeweb?)

```
for i in 1 2 3; do nc -zw8 vh328.timeweb.ru 22 && echo OPEN || echo TIMEOUT; done
# result: OPEN x3
```

## Session 2 (one batch — user + key)

```
id jump >/dev/null 2>&1 || useradd -m -s /usr/sbin/nologin jump
mkdir -p /home/jump/.ssh && chmod 700 /home/jump/.ssh
echo 'restrict,port-forwarding <contents of keys/jump.pub>' >> /home/jump/.ssh/authorized_keys
chmod 600 /home/jump/.ssh/authorized_keys && chown -R jump:jump /home/jump/.ssh
```

What the restrictions mean:
- `nologin` shell + `restrict` — the key can NEVER open a shell or run any command on the VDS.
- `port-forwarding` — the ONLY capability: relaying TCP (exactly what ProxyJump/-W needs).
- Blast radius if the key leaks: someone can relay TCP through the VDS. No root, no files.

## Verification

From a machine with both keys: see README "Testing the chain manually" — expect `cs99850`.

## Key rotation

Generate a new pair, add the new public line to authorized_keys (same restrict options),
update `JUMP_SSH_PRIVATE_KEY` in safe, remove the old public line. One VDS session.
