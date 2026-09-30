# Security

Security is a graded part of this project. Keep these rules when contributing.

## Practices

- **Scanning.** Every push and pull request runs [Aikido Security](https://www.aikido.dev)
  (dependencies, secrets, SAST) and `npm audit --audit-level=high`. A finding of HIGH or
  above blocks the merge. Dependabot opens weekly update PRs.
- **Secrets.** API keys live only in `.env.local`, which is git-ignored. Never commit keys,
  never log them, never expose them to the browser (no `NEXT_PUBLIC_` prefix on secrets).
  All provider clients are server-only modules.
- **Input validation.** Every API route validates its body with zod before touching a
  provider. Text sent to ElevenLabs is capped in length.
- **Third-party calls.** OpenAI, ElevenLabs and Google are called from the server only, with
  the minimum scopes/keys needed. Generated audio is written under `public/audio` with a
  hashed filename derived from the input, never from user-supplied paths.
- **Dependencies.** Keep Remotion packages on the same version. Run `npm audit` before
  releasing and fix or document anything HIGH or above.

## Dependency overrides

`package.json` carries three `overrides` that pin transitive packages to patched releases:

| Override | Pulled in by | Fixes |
| --- | --- | --- |
| `brace-expansion@1` -> `1.1.21` | `eslint` -> `minimatch@3` | HIGH advisory in `<=1.1.20` |
| `brace-expansion@5` -> `5.0.12` | `typescript-eslint` -> `minimatch@10` | HIGH advisory in `5.0.0-5.0.11` |
| `fast-uri@3` -> `3.1.8` | `@remotion/bundler` -> `webpack` -> `schema-utils` -> `ajv` | HIGH advisory in `3.0.0-3.1.7` |

They exist because the maintainers' npm config sets `min-release-age = 30` (a supply-chain
guard that refuses packages published less than 30 days ago), and the patched versions were
published on 2026-09-14/15. Until that window closes `npm audit fix` cannot pick them up, so
they are pinned explicitly and the lockfile was refreshed once with
`npm install --min-release-age=15`. CI runners have no release-age guard, so `npm ci` from
the lockfile works there unchanged.

After **2026-10-15** the overrides can be removed: run `npm audit fix` (or a normal
`npm update`), confirm `npm ls brace-expansion fast-uri` still shows patched versions, and
delete the `overrides` block.

For the same reason `next` and `eslint-config-next` were moved to `16.3.6` on 2026-09-30
with `npm install --min-release-age=7`: [GHSA-vcvr-r3jv-pc5j](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j)
(critical, RCE in `next/og`, affects `>=16.2.0 <16.3.6`) was published that day. The app
does not use `next/og`, but the audit gate blocks on it regardless. 16.3.6 is the oldest
patched release, so it was the smallest possible relaxation of the guard.

## Reporting

Open a GitHub issue labelled `security`, or contact the maintainers directly for anything
sensitive.
