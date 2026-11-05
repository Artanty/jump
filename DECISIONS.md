# DECISIONS

## 2026-11-05 — jump service bootstrap
- **Task**: SSH relay through the user's VDS (188.225.26.46) so GH-Actions deploys to Timeweb stop depending on runner-IP luck (11 dropped / 2 ok; whole-host per-IP block, ledger in know).
- **Design (user-approved)**: dedicated restricted user `jump` (nologin + `restrict,port-forwarding` key) — forward-only, root untouched. Dedicated ed25519 keypair, private half only in safe. serf VH workflows gained optional `SSH_JUMP_HOST` + `JUMP_SSH_PRIVATE_KEY` (absent = direct). No Timeweb-side changes (user forbids workers there; Serveo/CF-tunnel family rejected).
- **VDS touches (exactly 2 sessions per contract)**: (1) read-only probe — VDS→Timeweb:22 OPEN x3; (2) batch useradd + authorized_keys install, verified `id jump`.
- **Verified**: full chain local→VDS(jump)→Timeweb: `whoami` → `cs99850` (CHAIN-OK). Workflow generation validated (YAML + config snippet behavior). Note: first chain test failed only on local key file perms (0644) — chmod 600 fixed.
- **Pending (user)**: safe rows `SSH_JUMP_HOST=jump@188.225.26.46` + `JUMP_SSH_PRIVATE_KEY` (single-line, from `.jump_key.oneline`) for feat@back and plst@web; commit+push serf; re-deploy.

## 2026-11-05 (2) — jump becomes a self-bootstrapping node backend (public-repo-safe)
- **Design (user-approved)**: node app (express+dotenv) in back/; at every startup it idempotently ensures the restricted jump user + authorized_keys line (args-as-arrays, drift-healing, per-step logging); systemd keeps the WHEN (unit ensured by the deploy, Restart=always); deploy script itself does no app logic. Repo is public-safe: all values via the private slave .env (JUMP_USER, JUMP_PUBLIC_KEY, JUMP_KEY_OPTIONS). Logging: stdout->journald + in-memory ring served at /logs; /healthz, /status.
- **VDS clean slate**: userdel -r jump done (1 session) — acceptance test = pipeline deploy recreating it.
- **serf**: VDS-back generation split by prisma presence (totp exact vs slim variant with printf-built systemd unit-ensure; scp has NO exclude input — strip step removes node_modules/.git/.github before upload; found by validation that a column-0 [Unit] heredoc breaks the inner YAML).
- **Verified locally**: app smoke test on macOS (dev mode skips os bootstrap): /healthz, /status, /logs + request logging all working; both serf variants generate valid YAML (raw + rendered); githooklib bump via test commit.
