# RELAY PR #19 — separate local session review

Date: 9 November 2026. Scope: the already merged session-ID change only.
Status: locally inspected and regression-tested; no independent human acceptance or
production-security approval is implied. SECURITY HOLD remains.

## Exact source

- Original change: [`8efb2a4dd6b9cd04960fb035b53a11ff1f8f9a9c`](https://github.com/lregaladohdez/tectonic-sdworx/commit/8efb2a4dd6b9cd04960fb035b53a11ff1f8f9a9c).
- Inspected local base: upstream merge `2883e7c2b88e1d73f6f3e98db509f3945573fb15`, with the later fork form correction preserved.
- `src/lib/auth/session.ts` SHA-256: `c293f15d5d7fea9dfaa6957b4bd4dab3d895c12e4725f3d21d5c2f0468321166`.
- `src/lib/auth/session.test.ts` SHA-256: `4421347d8abf458ab01022272496d530880e4a7723f91de873929e0e66393a75`.
- Both files remain unchanged by this repair. The auth review is separate from the feature changes.

## Finding and bounded conclusion

Previously, issuing two cookies for the same user during the same second generated the
same signed payload. Revoking one could therefore revoke the other. The existing change
adds a server-generated random UUID (`sid`) to newly issued signed payloads. Revocation
remains tied to the signed token, so a separate login gets a separate revocation entry.
Legacy signed cookies without `sid` still verify, revoke and expire through the existing
compatibility path. The ID is included in the HMAC; it is not supplied by a browser claim.

The existing synthetic tests cover same-second sessions, fresh login after sign-out,
independent revocation, expiry, wrong secret, modified payload/signature, garbage input,
weak signing secret and legacy-cookie compatibility. Local command:

```text
npm exec vitest run src/lib/auth/session.test.ts
9 November 2026 — exit 0; 1 file, 8 tests passed.
```

This supports retaining the narrow session-ID correction. It does not retroactively
authorize the merge of PR #19 or establish approval by Lorenzo, the CEO or a security auditor.

## Boundaries still open

- Seeded demo users and one shared passcode are not individual human authentication.
- Revocations are process-local: another instance or a restarted instance can accept a
  still-unexpired token whose revocation it does not hold. The eight-hour expiry remains.
- No real accounts, production cookies, live logout or multi-instance deployment were
  exercised. The tests are synthetic, and not a general penetration test.
- Any durable revocation store, SSO or production-auth change needs its own design and review.

Lorenzo's original request for separate auth review remains a review requirement:
<https://github.com/lregaladohdez/tectonic-sdworx/pull/19#discussion_r4505839965>.
