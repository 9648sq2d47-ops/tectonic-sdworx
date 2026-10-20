# SD Worx repository and evidence scope

Checked 20 October 2026. This is a documentation review of existing source and
historical checks, not a new product run or confirmation of a final submission.

## Two different source states

| Source | Pinned code commit | Meaning |
| --- | --- | --- |
| This fork's code baseline | `f77a9198eeaa869e61577df0833fca816cc5ac07` | Earlier script / voice / video generator |
| Upstream Relay | `4bd9a6a5572b4f188c2db0c3bf2679ccea27117a` | Later seeded client-handover proof of concept |

The [source comparison](https://github.com/lregaladohdez/tectonic-sdworx/compare/f77a9198eeaa869e61577df0833fca816cc5ac07...4bd9a6a5572b4f188c2db0c3bf2679ccea27117a)
shows 38 commits between these states. Documentation commits on this fork do not
import Relay. Upstream badges or checks do not validate this fork's current code.

## Historical Relay checks

[Pipeline 36771861266](https://github.com/lregaladohdez/tectonic-sdworx/actions/runs/36771861266)
checked out `4bd9a6a5572b4f188c2db0c3bf2679ccea27117a` on 30 September 2026.
Its test job 110080515346 records 67 passing tests across 9 files, a successful
dependency audit, typecheck, lint and build. The separate deployment job
110080944814 completed successfully, including its smoke test.

These are historical results for that source state, not current security
clearance, full browser acceptance or results for `f77a919`. Relay uses seeded
fictional clients/documents and does not demonstrate live customer ingestion.

## Audit evidence and submission remain separate

At the pinned Relay commit:

- `docs/aikido/before.png` exists and shows a repository issue overview with
  nine findings. It does not by itself identify a complete AI Code Audit run.
- `docs/aikido/after.png` was not found at the documented path.
- [docs/aikido/README.md](https://github.com/lregaladohdez/tectonic-sdworx/blob/4bd9a6a5572b4f188c2db0c3bf2679ccea27117a/docs/aikido/README.md)
  distinguishes the AI Code Audit from the GitHub App dependency check.
- [docs/SUBMISSION.md](https://github.com/lregaladohdez/tectonic-sdworx/blob/4bd9a6a5572b4f188c2db0c3bf2679ccea27117a/docs/SUBMISSION.md)
  is a copy sheet with unchecked submission items. Its claim that both screenshot
  paths are absent is stale for `before.png`.
- The exact submitted Builderbase version, timestamp, included evidence and
  jury access are not established by these repository files.

Do not recreate an old after-screenshot or use a new audit as proof of a
historical submission.

## Pending upstream dependency update

[Upstream PR #16](https://github.com/lregaladohdez/tectonic-sdworx/pull/16)
was open and unmerged when checked. Its head was
`3181a2a20e7cee9230bd75cbd17f03f0f8e27827`. It proposes multiple dependency
updates, including Next.js 16.3.8 to 16.4.0.

[Run 38629507085](https://github.com/lregaladohdez/tectonic-sdworx/actions/runs/38629507085)
failed at the dependency-audit step. Typecheck, lint, tests, build and deployment
were skipped. This PR is not a verified repair, and its failure does not rewrite
the separate successful historical main run.

## Evidence needed to close the review

1. Retrieve the original final Builderbase record and identify the submitted
   repository commit, video, screenshots and timestamp.
2. Retrieve the genuine Aikido before/after run evidence tied to that submission.
3. Assess current security findings against the affected repository and deployed
   revision before preparing a narrowly scoped repair.
4. If this fork is to run Relay, review an explicit source-sync change separately;
   changing its README or linking an upstream PASS does not synchronize code.

This record changes documentation only. It grants no deployment, production
acceptance, execution permission or modification of a historical submission.
