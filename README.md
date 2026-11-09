# Relay: trust-verified client handovers

[![Aikido Security](https://app.aikido.dev/assets/badges/label-only-light-theme.svg)](https://app.aikido.dev)
[![Pipeline](https://github.com/lregaladohdez/tectonic-sdworx/actions/workflows/pipeline.yml/badge.svg)](https://github.com/lregaladohdez/tectonic-sdworx/actions/workflows/pipeline.yml)

Built for the SD Worx track of the Tectonic Hackathon (30 Sep 2026): *"Find it. Understand
it. Trust it."* **Relay verifies the handover, not the search.**

## Local repair status — 9 November 2026

This working version is a **local, synthetic review candidate under SECURITY HOLD**.
It starts from upstream merge `2883e7c2b88e1d73f6f3e98db509f3945573fb15` and retains the
later fork correction `75ff44e979eb123c0da1e519566a5d2d0d0af812`. Local build permission
does not authorize a remote PR, merge, deployment, real transcript or provider call.

Live LLM use and live capture are off by default, even when credentials are present.
The deployment job in this repair is unconditionally disabled. These are local code
changes; they do not change the currently published upstream workflow or running service.
Human review remains necessary: a source match or model verdict is not an independent
confirmation of meaning, legal correctness, identity or consent.

Claims, reviews, duplicate detection, rate limits, assessment cache and session revocations
are process-local demo state. Use one Node process for a synthetic demonstration. Restarting
it loses new claims and reviews; parallel instances do not share state. No durable storage
or production use is claimed. Video tooling separately writes files under `out/`; this
repair does not make those files durable, backed up, or automatically deleted.

When a payroll consultant inherits a client, the handover is one document and one
conversation. Some of what they hear is tacit, some is outdated, some is wrong, and they
cannot tell which until a payslip fails. Relay turns the handover into a list of **claims**,
runs every claim through pluggable **trust signals**, and shows the consultant a **claim
board** where each statement carries its verdict, the verbatim evidence behind it, and the
human action it needs. Nothing is hidden behind a black box: every verdict links to a
passage, a regulation or a person. Accepted claims become the **verified client brief**.

## Historical submission references

| What | Where |
| --- | --- |
| Live demo | <https://tectonic-sdworx-970554784378.europe-west1.run.app>, sign in as `incoming@relay.demo` (passcode shared with the jury separately) |
| Demo video (under 3 minutes) | https://youtu.be/eWgWXcniSg0 |
| Repository | <https://github.com/lregaladohdez/tectonic-sdworx> |
| Builderbase copy sheet | [docs/SUBMISSION.md](docs/SUBMISSION.md) |

Aikido AI Code Audit, before and after fixing (the two PNGs are added by hand after the
audit runs; steps in [docs/aikido/README.md](docs/aikido/README.md)):

![Aikido AI Code Audit, before](docs/aikido/before.png)

![Aikido AI Code Audit, after](docs/aikido/after.png)

## What the demo shows

A seeded workspace with three fictional Belgian clients changing hands in one payroll team:
a bakery (Bakkerij Janssens BV, joint committee 118), a garage (Garage Willems NV, JC 112)
and a home-care non-profit (Thuiszorg De Brug vzw, JC 330). Sixteen documents, five
colleagues, three scripted handover calls, nineteen claims, four signals. The workspace page
lists the clients, the regulation notices the signals watch, the team's experts and every
knowledge source. Each client has its own planted story; the bakery, in detail:

| Claim                                         | What the signals find                                                                                                             |
|-----------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------|
| Meal vouchers are 7 euro                      | **Contradicted**: the 2026 arrangement says 8 euro and replaced the 2024 one; the RSZ raised the employer cap on 1 Jan 2026 (source linked) |
| Sunday premium is 50%                         | **Contradicted**: the client file, company agreement §7, says 100%                                                                |
| Delivery vans, no benefit in kind             | **Outdated**: the only evidence is an email from May 2023; the 2026 CO2 reference values changed                                  |
| Wages in JC 118 indexed every January         | **Expiring**: no document covers it, but the FPS Employment fiche shows the Jan 2026 indexation; ask Els Peeters                  |
| Owner prefers WhatsApp                        | **Unsupported**: tacit knowledge; route it to Nadia, who said it                                                                   |
| 13th month in December, JC 118, holiday in May | **Confirmed**, with the exact passage                                                                                             |

Those describe the original fixture demonstration, not the acceptance results of this
repair. The revised deterministic judge keeps incomplete support open for human review.
With separately authorized and explicitly enabled LLM processing, the evidence judge
can propose an interpretation of passages. A positive model answer still needs source
coverage: a notice about January 2026 does not establish a rule for every January.
Missing coverage stays open for human review. The local checks do not establish legal truth.

Garage Willems: the eco-cheque amount rests on an email from 2022, the company-car claim
contradicts the client file while the car policy was revised in 2026, and an overtime rule
was never written down. Thuiszorg De Brug: the night premium contradicts the client file,
the bike allowance rests on a 2024 email, and the director's phone preference lives only in
the outgoing consultant's head. Signals only read documents filed under the claim's own
client (`src/relay/scope.ts`), so one client's policy never counts as evidence for another.

For each claim the consultant can **accept** it, mark it **resolved**, or **ask** the
proposed expert; the brief page collects the accepted claims.

## How it works

Each captured claim is evaluated by the registered signals in parallel. Their evidence
and verdicts are consolidated for the board before a human review can add a claim to the
brief. The current verdict precedence is contradicted, outdated, expiring, confirmed,
then unsupported; absent signal evidence remains unknown. These are application labels,
not independent human approval.

The kernel (`src/relay`) knows nothing about payroll: types, a registry, a scoped store,
consolidation and the seeded fixtures. Signals are plugins under `src/relay/signals/*`.
Adding one is one folder and one import; see [docs/signals.md](docs/signals.md).

| Signal             | Category | What it does                                                                                                                                                                              |
|--------------------|----------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Document evidence  | trust    | Retrieves relevant passages and reports confirm / contradict / unsupported. Live LLM only when explicitly enabled and configured; deterministic evaluation otherwise. Incomplete support stays open for human review. |
| Document freshness | detect   | Deterministic, no model. Superseded, revised or old evidence → outdated / expiring                                                                                                        |
| Regulation watch   | detect   | Matches each claim's legal anchor (topic, country, joint committee) against a curated feed of real 2026 Belgian changes with official sources; an LLM judges whether the change contradicts or supports the claim |
| Expert locator     | connect  | Scores people by topic, document ownership, jurisdiction and authorship; proposes who to ask                                                                                              |

## Run it

Node 22 or newer.

```bash
npm install
cp .env.example .env.local     # set SESSION_SECRET (openssl rand -hex 32) and RELAY_DEMO_PASSCODE
npm run dev                    # http://localhost:3000 → /login
```

Sign in as `incoming@relay.demo` (Jonas) with the passcode from `.env.local`. Other seeded
users: `nadia@relay.demo` (same workspace) and `outsider@relay.demo` (another workspace, to
see the scoping in action).

**Synthetic mode is the default.** Keep `RELAY_LIVE_AI_ENABLED=false` and
`RELAY_LIVE_CAPTURE_ENABLED=false` while SECURITY HOLD applies. Credentials alone do not
enable LLM requests. After a separate processing approval, enabling the first flag would
permit configured signal providers; enabling capture additionally requires the second
flag and credentials for the exact `LLM_PROVIDER`. Capture never switches providers as a
fallback. The existing signal-provider fallback is distinct and needs to be considered
in any later processing approval. These switches do not authenticate a CEO decision.

The capture form explains availability and ephemeral demo storage. Expected errors retain
the entered transcript. Accepted and rejected claims are reported separately; no accepted
claim is written until the accepted set has passed source checks. The extraction limit is
five claims per capture, with complete quoted turns up to 1,000 characters. These are
bounded demo limits, not evidence that a long transcript has been completely extracted.
`ELEVENLABS_API_KEY` belongs to the separate voice tooling, which is outside this capture
repair and is not authorized for use by this local build.

```bash
npm test                        # current synthetic/mocked regression suite
npm run relay:board             # prints the consolidated board with the deterministic judge
npm run relay:board -- --all    # every client; --client <id> for one
# --live is outside the current SECURITY HOLD scope; do not run it for this repair.
npm run typecheck && npm run lint && npm run build
```

## Where things are

| Path                                          | What                                                                             |
|-----------------------------------------------|----------------------------------------------------------------------------------|
| `src/relay/`                                  | Kernel: `types.ts` (the `TrustSignal` contract), `registry.ts`, `consolidate.ts`, `store.ts`, `assess.ts`, `fixtures/` |
| `src/relay/signals/*`                         | The four signals, each with its tests                                            |
| `src/app/w/[workspaceId]/clients/[clientId]/` | Claim board page and `brief/` (verified brief)                                   |
| `src/app/api/w/[workspaceId]/claims/[claimId]/review/` | The review endpoint (accept / resolve / ask)                            |
| `src/lib/auth/`, `src/lib/http/guards.ts`     | Signed session cookie, workspace membership, same-origin check, rate limits      |
| `src/lib/ai/`                                 | OpenAI, Google (Gemini API or Vertex), ElevenLabs clients; `llm.ts` picks and falls back |
| `src/components/relay/`                       | Claim card, status badge, actions, shell, login form                             |
| `src/remotion/`, `scripts/voice-*.ts`, `scripts/music-bed.ts` | Demo video tooling (title cards, per-scene voice-over, music bed) |
| `docs/`                                       | [signals.md](docs/signals.md), [STYLE.md](docs/STYLE.md), [VIDEO_SCRIPT.md](docs/VIDEO_SCRIPT.md), [SUBMISSION.md](docs/SUBMISSION.md), [aikido/](docs/aikido/README.md) |

## API

All routes validate their body with zod. State-changing routes require a session, check
that the request `Origin` matches the host, and are rate limited per user.

| Route                                                | Body                                         | Result                                                        |
|------------------------------------------------------|----------------------------------------------|---------------------------------------------------------------|
| `POST /api/auth/login`                               | `{ email, passcode }`                        | Sets the session cookie; `{ ok, workspaceId }`                |
| `POST /api/auth/logout`                              |                                              | Clears the cookie                                             |
| `POST /api/w/:workspaceId/claims/:claimId/review`    | `{ status: open\|accepted\|resolved\|asked, note?, personId? }` | The stored review; 404 for a claim or person outside the caller's workspace |
| `POST /api/script`                                   | `{ topic, provider?: "openai"\|"google" }`   | `{ script, provider }` (video tooling)                        |
| `POST /api/tts`                                      | `{ text, voiceId? }`                         | `audio/mpeg` stream, never written to disk (video tooling)    |
| `POST /api/render`                                   | `{ title, subtitle, voiceOver? }`            | `{ fileName }` MP4 under `out/` (video tooling)               |

## Security

Security is part of the grade, so it is part of the workflow. Signed `httpOnly` session
cookie with constant-time verification, seeded users behind a passcode with login rate
limiting, every store read scoped by workspace id (a record from another workspace is *not
found*, even with its id), same-origin checks on mutations, zod on every input, provider
keys in server-only modules loaded through a validated env schema, CSP and the usual
headers. The connected Aikido GitHub App reports a PR check; repository rules are also
needed to enforce it. Green tests do not grant permission to merge or deploy. This local
pipeline runs full and runtime dependency audits at the high threshold and disables its
deployment job. The controls, historical checks and known gaps are in
[SECURITY.md](SECURITY.md).

To activate Aikido on a fresh fork: connect the repo at app.aikido.dev (this installs the
PR check App). Do not add Aikido's GitHub Action on top; Aikido rejects it on a repo the App
already protects.

## Historical deployment setup (not authorized by this repair)

Previously recorded service URL: <https://tectonic-sdworx-970554784378.europe-west1.run.app>.
The live service and its current data were not verified for this repair.

The app ships as one container ([Dockerfile](Dockerfile)) that runs `next start` and can
render videos server-side with Remotion's headless Chrome. The historical workflow ran
tests followed by an automatic Cloud Build / Cloud Run deployment on pushes to `main`.
The merge of PR #19 triggered that job; its Google authentication failed before image
build or revision deployment. See [the run](https://github.com/lregaladohdez/tectonic-sdworx/actions/runs/42533705135).
The local repair disables deployment for every event, including manual dispatch. The
commands below document the old setup, not a next action while SECURITY HOLD applies.
That setup used keyless Workload Identity Federation
(`scripts/gcp/setup-github-deploy.sh` creates the pool, provider and service account once),
then a smoke test of `/` and `/login`.

Historical manual commands (do not execute under this repair authorization):

```bash
PROJECT=qwiklabs-gcp-02-8ec6a39cdba0
REGION=europe-west1
IMAGE=$REGION-docker.pkg.dev/$PROJECT/apps/tectonic-sdworx:$(git rev-parse --short HEAD)

gcloud auth login && gcloud config set project $PROJECT
gcloud artifacts repositories create apps --repository-format=docker --location=$REGION  # once
gcloud builds submit --region=$REGION --tag $IMAGE --timeout=1500 .
gcloud run deploy tectonic-sdworx --region=$REGION --image=$IMAGE \
  --no-allow-unauthenticated --memory=4Gi --cpu=2 --timeout=600 --concurrency=4
```

A fresh deploy starts private: only Google identities with `roles/run.invoker` can call it
(test with `curl -H "Authorization: Bearer $(gcloud auth print-identity-token)" <url>`).
The demo deployment above is **public**, opened once with:

```bash
gcloud run services add-iam-policy-binding tectonic-sdworx --region=$REGION \
  --member=allUsers --role=roles/run.invoker
```

Why public is acceptable here: the anonymous surface is the landing redirect, the login page
and the login endpoint. Everything else needs the signed session cookie: pages redirect to
`/login`, every API route answers 401 without a session and 401 to cross-origin POSTs, the
provider routes (script, tts, render) are rate-limited per user, login is limited to 5
attempts per IP per minute with constant-time passcode comparison, and the container runs as
a non-root user with CSP, HSTS, `X-Frame-Options: DENY` and `nosniff` on every response. Verified
against the public URL on 30 Sep 2026 (see [SECURITY.md](SECURITY.md)). Spend is capped by
`--max-instances=3`; the pipeline never changes the invoker binding, so a redeploy keeps it.
To close it again, run the same command with `remove-iam-policy-binding`.

Secrets never go in the image, the repo, or plain env vars. Login needs `SESSION_SECRET`
and `RELAY_DEMO_PASSCODE`; the providers need their keys. Put them in Secret Manager and
bind them to the service (the runtime service account needs
`roles/secretmanager.secretAccessor`):

```bash
for pair in SESSION_SECRET:session-secret RELAY_DEMO_PASSCODE:relay-demo-passcode \
            ELEVENLABS_API_KEY:elevenlabs-api-key OPENAI_API_KEY:openai-api-key \
            GOOGLE_API_KEY:google-api-key; do
  var=${pair%%:*}; name=${pair##*:}
  val=$(grep -E "^$var=." .env.local | tail -1 | cut -d= -f2-)
  [ -z "$val" ] && continue
  if gcloud secrets describe $name >/dev/null 2>&1; then
    printf '%s' "$val" | gcloud secrets versions add $name --data-file=-
  else
    printf '%s' "$val" | gcloud secrets create $name --data-file=-
  fi
done
gcloud run services update tectonic-sdworx --region=$REGION \
  --update-secrets=SESSION_SECRET=session-secret:latest,RELAY_DEMO_PASSCODE=relay-demo-passcode:latest,OPENAI_API_KEY=openai-api-key:latest
```

Caveat: the hackathon Qwiklabs project carries an org policy
(`constraints/vertexai.allowedModels` = deny all) that blocks every Gemini model on Vertex,
so on this project use OpenAI or a Gemini API key. The fallback in `src/lib/ai/llm.ts`
handles the refusal automatically.

## Demo video tooling

The submission video is scripted in [docs/VIDEO_SCRIPT.md](docs/VIDEO_SCRIPT.md). With
`ELEVENLABS_API_KEY` set:

| Command                     | What it does                                                               |
|-----------------------------|----------------------------------------------------------------------------|
| `npm run voice:samples`     | Renders scene 1 with a shortlist of narrator voices into `public/audio/samples/` |
| `npm run voice:scenes`      | One MP3 per scene from the script table, with measured durations           |
| `npm run music:bed`         | Generates the instrumental bed with ElevenLabs Music                       |
| `npm run remotion:studio`   | Remotion Studio for the title cards (`PromoVideo` composition)             |
| `npm run remotion:render`   | Renders `PromoVideo` to `out/PromoVideo.mp4`                               |
| `npm run video:record`      | Records the app footage for the demo with Playwright                       |
| `npm run video:render`      | Renders the `DemoVideo` composition to `out/relay-demo.mp4`                |

## Unfinished, on purpose

- Claims begin with synthetic fixtures. The capture flow is implemented and tested with
  stubs, but live capture is disabled and real client transcripts are not authorized.
- Speaker parsing and legal-topic recognition use limited text grammars. They do not
  prove identity, complete extraction or legal meaning. At most five claims are retained
  per capture; a complete quoted turn is limited to 1,000 characters.
- Exact retries use workspace, client, date and normalized transcript. After a partial
  capture, an identical retry is a duplicate; it does not reprocess rejected rows. A
  separate correction/reprocessing workflow has not been added.
- No Teams, SharePoint or HR-system connectors; the sixteen documents are seeded.
- The regulation feed is curated by hand from official pages, not pulled live.
- Single shared demo passcode instead of per-user credentials or SSO.
- In-memory claims, reviews, rate limits, cache and sign-out records reset when the server
  restarts. This is one process, with no database, backup or global revocation.
- The Remotion briefing exists as a composition but is not generated from the verified
  brief yet.
- Rendered videos are written to the container's ephemeral disk and are not downloadable.
