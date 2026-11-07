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

## 2026-11-06 (2) — jump test workflow for slave repo (before)
- **Plan**: user's VH deploy failed (`Connection timed out`, runner 20.65.227.102, exit 255 on
  the mkdir probe) AND the log has NO "Relaying through jump host" line → jump envs
  (`SSH_JUMP_HOST`/`JUMP_SSH_PRIVATE_KEY`) absent from the slave `.env` — the deploy ran
  direct and hit the known Timeweb runner-IP block. Actions: (1) create a one-shot
  `jump-chain-test.yml` the user places into the slave repo to verify the relay from a GH
  runner (presence report + TCP probes + direct vs chain ssh); (2) add 20.65.227.102 to the
  know blacklist ledger. No VDS touches, no keys in any file/log.

## 2026-11-06 (3) — know: jump enable-rows reminder (before)
- **Plan**: user confirmed the slave `.env` never carried the jump envs (deploy ran direct →
  Timeweb IP drop). Add the enablement recipe to `know/entries/vds-jump-host.md`: the two safe
  rows (SSH_JUMP_HOST=jump@188.225.26.46, JUMP_SSH_PRIVATE_KEY from back/.jump_key.oneline),
  both-or-nothing rule, serf re-run needed to propagate into the slave `.env`, and the
  "no Relaying line = went direct" symptom.

## 2026-11-07 (2) — jump_key missing final newline (before)
- **Plan**: relay+hostkey now pass; run dies at `Load key "...jump_key": error in libcrypto`
  → `Permission denied (publickey,password)` exit 255. Root cause (forensics + OpenSSH source,
  proven): safe's JUMP_SSH_PRIVATE_KEY value = 404 chars, ends with `-----` (paste dropped the
  oneline file's trailing newline) → `printf '%b'` writes a 398-byte file with NO final newline
  → openssh parser requires MARK_END incl. trailing \n (sshkey.c:3010-3040) →
  SSH_ERR_INVALID_FORMAT → falls back to PEM/libcrypto (sshkey.c:3713-3719) → Ubuntu OpenSSL:
  "error in libcrypto", macOS LibreSSL: "invalid format" (same bytes, same cause — replica
  reproduces locally). Deploy key survives because it's PEM (libcrypto tolerant), not openssh.
  Fix: `printf '%b\n'` (all 4 key writes in serf's 2 VH variants + jump-test step 3) + fail-fast
  `ssh-keygen -y` validation guard after key writes + regenerate .jump_key.oneline fully-escaped
  (silent, byte-counts only, gitignored file) + know gotcha + DECISIONS. No safe changes needed
  (value content is correct). Validations as usual, no VDS touches.

## 2026-11-07 (2) — jump_key missing final newline (after)
- **Fixed**: all 4 key writes in serf's 2 VH variants now `printf '%b\n'` (extra newline
  harmless for PEM and openssh — both formats verified loading) + fail-fast guard after key
  writes: `ssh-keygen -y -P '' -f <key>` → clear `::error::` naming the malformed .env/safe
  row instead of ssh's opaque `error in libcrypto` mid-auth. Same fix+guard in
  jump/jump-test.yml step 3. Regenerated `back/.jump_key.oneline` fully-escaped (405→406B,
  0 real newlines — future pastes survive even an unfixed workflow); roundtrip + same-key md5
  verified. know vds-jump-host: new gotcha with the full symptom→cause→source-line chain.
  **No safe change needed** — the 404-char value content was correct all along.
- **Validated** (no VDS touches): outer YAML + every run block `bash -n` (serf deploy.yml,
  jump-test.yml); all 7 heredoc-generated inner workflows parse + `bash -n`; assertions:
  2 newline-fixes + 1 guard per vh-deploy variant, 0 old-style `printf '%b' "$…"` sites left;
  E2E replica: real safe value → new pipeline → f_jump 399B + f_deploy 1675B, both guard PASS.
- **Root cause chain** (OpenSSH source, sshkey.c): value ends `-----` (paste dropped the
  oneline file's trailing newline) → `%b` writes openssh key w/o final `\n` → MARK_END check
  needs the newline (3010-3040) → INVALID_FORMAT → PEM fallback (3713-3719) → Ubuntu:
  "error in libcrypto", macOS: "invalid format". PEM deploy key tolerates, openssh jump key
  doesn't — hence only jump_key died.
- **Pending (user)**: commit+push serf (+ jump repo); fresh dispatch (`-d`) — re-run of the
  old run keeps the old workflow; optional: run jump-test.yml first (step 3 now guards).

## 2026-11-07 — jump child ssh fails host-key check (after)
- **Fixed**: jump `Host` block in the `printf` config snippet now carries
  `StrictHostKeyChecking no` + `UserKnownHostsFile /dev/null` — serf deploy.yml BOTH variants
  (py-back l.510, web l.620, one replaceAll) + jump/jump-test.yml step 3. Final hop unchanged:
  its `-o` flags sit directly on SSH_CMD where they apply (verified: parent → false+/dev/null,
  ProxyJump set; child → false + /dev/null + jump_key + IdentitiesOnly).
- **know**: vds-jump-host.md — snippet description updated + new Gotchas section (child
  ignores parent `-o` flags; local test masks it via existing known_hosts; missing-row =
  silent direct fallback).
- **Validated** (no VDS touches): outer YAML+all run blocks `bash -n` OK (serf deploy.yml,
  jump-test.yml); all 7 heredoc-generated inner workflows parse as YAML + bash -n OK; fix
  asserted present in both generated vh-deploy.yml variants; `ssh -G -F <snippet>` resolves
  jump hop (strict=false, known_hosts=/dev/null, jump_key, identitiesonly) and final hop
  (strict=false, proxyjump set) exactly as required.
- **Pending (user)**: commit+push serf; fresh dispatch (`-d` commit) — re-running the old run
  keeps the old workflow version; optionally run jump-test.yml in the slave first.

## 2026-11-07 — jump child ssh fails host-key check (before)
- **Plan**: relay engaged (`Relaying through jump host 188.225.26.46`) but run died with
  `Host key verification failed.` + `Connection closed by UNKNOWN port 65535`. Diagnosis:
  ProxyJump spawns a separate ssh child for the VDS hop; the child reads ~/.ssh/config but
  does NOT inherit the parent's `-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null`
  → empty runner known_hosts refuses 188.225.26.46. Local CHAIN-OK masked it (Mac known_hosts
  already has the VDS). Fix: add `StrictHostKeyChecking no` + `UserKnownHostsFile /dev/null`
  to the jump Host block in (1) serf deploy.yml both printf snippets (l.510 py, l.620 web),
  (2) jump/jump-test.yml step 3; document in know vds-jump-host; validate YAML+bash -n;
  no VDS touches. Rejected: ssh-keyscan pinning (extra network step, breaks on retarget,
  inconsistent with final-hop style). User pushes serf + fresh dispatch (re-run keeps old wf).

## 2026-11-06 (3) — know: jump enable-rows reminder (after)
- **Done**: `know/entries/vds-jump-host.md` gained "Enabling the relay (the two safe rows)" —
  table with `SSH_JUMP_HOST=jump@188.225.26.46` + `JUMP_SSH_PRIVATE_KEY` (from
  `back/.jump_key.oneline`, paste as-is), both-or-nothing rule, `-d` re-run as the only path
  from safe → slave `.env`, the "no `Relaying through jump host` line = went direct" log
  symptom, and pointer to `jump/jump-test.yml` for chain diagnosis. know README index line
  updated to mention the safe rows. No VDS touches, no key material in know (file path only).

## 2026-11-06 (2) — jump test workflow for slave repo (after)
- **Created** `jump-test.yml` (repo root) — manual-only (`workflow_dispatch`) diagnostic for the
  slave repo, placed as `.github/workflows/jump-test.yml`. 7 ordered steps pin where the chain
  breaks: .env presence → TCP probes (runner→jump, runner→timeweb direct, runner IP printed) →
  key materialization (same `printf %b` + config snippet as vh-deploy.yml) → jump auth
  (nologin rc=1 = OK; rc=0 = ANOMALY stop-and-ask; Permission denied = key mismatch) →
  relay TCP via `ssh -W` (timeout 124 = held open = OK) → full-chain `whoami` == SSH_USER →
  deploy path rehearsal (remote mkdir + `rsync --dry-run`). No secrets printed (keys as char
  counts only). Validated: YAML parses + every run block passes `bash -n`.
- **Root cause of the failed run** (diagnosed from the pasted log): NO "Relaying through jump
  host" line → `SSH_JUMP_HOST`/`JUMP_SSH_PRIVATE_KEY` absent from the slave `.env` → deploy ran
  direct → runner 20.65.227.102 TCP-dropped by Timeweb (added to know blacklist ledger) →
  exit 255 on the mkdir probe (before the retry loop). Fix is NOT the test file: set the two
  safe rows (stage DEPLOY) + re-run serf so the slave `.env` carries them, then re-deploy.
- **know updated**: `timeweb-github-ip-blacklist.md` +1 dropped IP (20.65.227.102, 2026-11-06).
- **Pending (user)**: copy `jump-test.yml` → slave repo `.github/workflows/`, run it, read the
  first failing step; add the safe jump rows and re-deploy feat. Delete the test file after use.

## 2026-11-06 — first deploy: service crash-looped (my bad marker line)
- **Symptom**: slave deploy worked end-to-end (scp, npm install, unit created, restart) but jump.service exit 1 in a loop (restart counter 33).
- **Root cause** (journalctl, quoted): `SyntaxError: Invalid or unexpected token` at app.js:66 — `# pipeline marker`. That line was appended during the 2026-11-05 githooklib bump test (shell-style `#` comment in a JS file — invalid outside line 1) and rode into the deploy.
- **Fix**: marker removed, node --check clean, committed (bump rode to 0.0.6, TAG 0.0.6.0.0.0). Lesson: bump-test markers must use the file's real comment syntax (`//` here) or touch a neutral file.
- **Pending**: user pushes + `-d` → expect unit green, /status userExists=true (user was userdel'd — bootstrap must recreate it), chain test through jump.
