# Source provenance — Phase 0 preliminary evidence

Scope: Snapvere main [b403f03](https://github.com/bren-wp/Snapvere/commit/b403f03bdd4de9d523b867e5831290cbe245de61); RvgeShot main [99976bc](https://github.com/notbrec/RvgeShot/commit/99976bc3500f236c49459a917e38b91e33ddbaeb). Observed 2026-11-26.

## License boundary — BLOCKED

Snapvere's root LICENSE is MIT (Copyright 2026 Brendigo); its commercial EULA explicitly preserves independent MIT and third-party rights. RvgeShot README states its license is TBD; a request for its root LICENSE returned 404. This is not exhaustive proof of absence of a license or of infringement. Public access alone does not establish a grant to redistribute or relicense. Obtain dated grants, contributor agreements or independently authored replacements before distributing affected code under BSP. Preserve history, notices and existing MIT grants. Do not treat cosmetic rewriting as a remedy.

## Reproducible preliminary screening

For each corresponding file at the pinned revisions, split UTF-8 content into lines, trim and collapse whitespace, exclude lines shorter than 15 characters, then count Snapvere lines occurring anywhere in the reference and six-consecutive-retained-line windows occurring in the reference. Repeated lines/windows count per occurrence. Comments are included. These are screening counts, not semantic similarity, chronology, copying direction, or legal conclusions. Paths below are relative to apps/desktop/.

| Path | Snapvere retained lines | Reference retained lines | Matching lines | Matching 6-line windows | Status |
|---|---:|---:|---:|---:|---|
| src/lib/canvas.ts | 125 | 124 | 124 | 119 | BLOCKED |
| src/windows/RecDraw.tsx | 214 | 194 | 182 | 131 | BLOCKED |
| src/windows/Overlay.tsx | 623 | 603 | 482 | 343 | BLOCKED |
| src/windows/Editor.tsx | 250 | 217 | 196 | 136 | BLOCKED |
| src-tauri/src/capture.rs | 146 | 99 | 90 | 65 | BLOCKED |
| src-tauri/src/commands.rs | 1444 | 764 | 622 | 164 | BLOCKED |
| src-tauri/src/db.rs | 458 | 126 | 100 | 34 | BLOCKED |
| src-tauri/src/record/mod.rs | 552 | 543 | 256 | 64 | BLOCKED |
| src-tauri/src/record/audio.rs | 438 | 245 | 196 | 73 | BLOCKED |

BLOCKED means pending rights/provenance review for proprietary release, not a finding of wrongdoing. Viewer.tsx was not found at the attempted src/windows path in either repository. Remaining recording files, assets, CSS, workflows, installers, docs, full history, dependencies and contributor rights are unreviewed. No source was copied into this report.

## Required follow-up

1. Enumerate complete trees and all historical file paths; record blob/commit, first appearance, authorship, upstream origin, license at acquisition, notices, and evidence per component.
2. Resolve rights for each affected file, with legal review of actual licensor identity and grants. Preserve lawful third-party terms and past MIT releases.
3. For unresolved components, isolate and use independently specified and implemented replacements; test interfaces, migration and compatibility. Review implementation provenance separately from functional parity.
4. Review full dependency graph and asset licenses, produce SBOM and attribution inventory.
5. Approve proprietary distribution only after evidence, legal review and native/security/release gates. No production license metadata or public repository visibility changes in this phase.

## Concurrent security gates

The existing [audit register](docs/AUDIT-2026-11-26.md) records unresolved filesystem identity races, memory safety acceptance, release-label discrepancy and semantic-clone scope. These remain open. No native tests, CI, binary verification or physical QA were performed by this screening; no release is authorized by this report.
