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

## Reporting

Open a GitHub issue labelled `security`, or contact the maintainers directly for anything
sensitive.
