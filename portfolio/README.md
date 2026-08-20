# Portfolio

This directory is for a reader deciding whether the engineering behind Kaiplan is real: a hiring
manager, an engineer doing due diligence, or anyone who wants more than the README's headline
numbers. Every claim in these documents traces to a file, a command, or a named decision elsewhere
in this tree. Nothing here should read as marketing copy you have to take on trust.

If you read one thing, read [ENGINEERING-LOG.md](ENGINEERING-LOG.md). It is the shortest path to
what got built, in what order, and what is still wrong with it.

## Contents

| File | Length | Covers |
|---|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | 245 lines | Request lifecycle, the three-layer permission model, the two-database topology, and why the cron pipeline runs serially. |
| [DESIGN.md](DESIGN.md) | 156 lines | Audience, brand personality, design principles, and the token tables behind both the original and the rebranded palette. |
| [ENGINEERING-LOG.md](ENGINEERING-LOG.md) | 136 lines | What shipped, in what order, sourced from the roadmap and the seven dated design docs, plus the defects still open. |
| [METRICS.md](METRICS.md) | 287 lines | Every number on the README, the exact command that produced it, and the two figures sourced from the private full-history repository. |
| [SECURITY.md](SECURITY.md) | 182 lines | Access control, tenant isolation, authentication, guest PII and its deletion paths, and payment and upload handling (the four internal audit findings with a surviving code comment, cited by file). |
| [TESTING.md](TESTING.md) | 186 lines | The per-file coverage gate and its full exclusion list, the local E2E harness, and how the gates were enforced without CI. |
| [screenshots/](screenshots/) | 7 images | The images referenced from the README and from this directory's own documents, not a document itself, so it needs no summary of its own beyond this row. |

Lengths above are `wc -l` against each file as of this pass; re-run it yourself if you want current
numbers rather than a snapshot of them.

`portfolio/` is retrospective: finite, written for a reader, and left alone once it is accurate. If
a document describes what was decided and why, it belongs here. `docs/` is prospective: the working
residue from actually building the product, design-doc specs and plans written *before* code
existed, a roadmap with phases still unchecked, an operational runbook, a step-by-step production
environment guide, and a launch checklist
([docs/production-readiness.md](../docs/production-readiness.md)) that stays exactly as written,
unticked boxes included.
