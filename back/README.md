# jump-back — SSH jump relay for Timeweb deploys

A small node service that **self-bootstraps an SSH relay** on whatever VDS it runs on: at
every startup it ensures a restricted, forward-only user exists (the deploy pipeline's key
can relay SSH to Timeweb and do nothing else). Runs under systemd; the pipeline restarts it
on each deploy, so bootstrap re-checks the world automatically.

## Why

Timeweb VH drops whole-host access (ports 21/22/80/443) for most GitHub-Actions runner IPs
(know/timeweb-github-ip-blacklist). Through this relay, Timeweb only ever sees the VDS's
stable IP. No process runs on the Timeweb side.

## This repo is public-repo-safe

Code only. All values arrive via the private slave repo's `.env` (written by serf from
safe rows): `JUMP_USER`, `JUMP_PUBLIC_KEY`, `JUMP_KEY_OPTIONS`, plus the VDS deploy envs.
The public half of an SSH key is not a secret; the private halves never enter any repo.

## Env vars (via .env / safe)

| var | meaning | default |
|---|---|---|
| `PORT` | http port | 3100 (serf defaults to 3000 if safe has no PORT row — but VDS back deploys now REJECT a missing PORT; always set a free one, e.g. 3100) |
| `JUMP_USER` | OS user to ensure | — (required on linux) |
| `JUMP_PUBLIC_KEY` | public key to authorize | — (required on linux) |
| `JUMP_KEY_OPTIONS` | authorized_keys options | `restrict,port-forwarding` |

## Endpoints

- `GET /healthz` — `ok`
- `GET /status` — `{userExists, keyPresent, options, bootstrappedAt, uptimeSec, node}`
- `GET /logs` — last ~200 log lines

## Local dev

```
cd back && npm install
JUMP_USER=x JUMP_PUBLIC_KEY=y node app.js   # non-linux: bootstrap auto-skipped (dev mode)
```

## Deploy (standard pipeline)

`-d` commit → githooklib tag → flow → serf (VDS hosting, namespace back) → slave workflow:
`npm ci`, scp to `/root/<slot>`, `npm install --omit=dev`, systemd unit ensured
(`Restart=always`), `systemctl restart`. Startup re-bootstraps.

## Logs on the VDS

`journalctl -u <slot> -f` (permanent record) or `GET /logs` (recent tail). Bootstrap logs
every step: user exists/created, key line present/appended, perms/ownership fixed.

## Bootstrap safety

Idempotent, drift-healing, args-as-arrays (no shell interpolation of env values). The
authorized_keys line is `restrict,port-forwarding <key>`: the key can ONLY relay TCP —
no shell, no commands, no pty. Old manual setup notes: `SETUP.md` (historical).
