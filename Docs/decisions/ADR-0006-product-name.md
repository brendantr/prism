# ADR-0006: Repello is the customer-facing product name

- Status: Accepted
- Date: 2026-08-21
- Sprint: `v1-repello-app-review-resubmission`
- Decision owner: Owner
- Supersedes: the customer-facing name used in ADR-0001 through ADR-0005
- Relates to: ADR-0003, ADR-0005, invariants I-4/I-5/I-14/I-15

## Context

The product was previously presented to customers as PRism. Before the v1 App Review resubmission,
the owner selected **Repello** as the customer-facing name to reduce name-conflict,
discoverability, and review risk. Earlier ADRs, sprint records, and review evidence remain accurate
historical records when they use PRism.

The selection is a product decision, not legal advice. This repository does not represent that the
name has received trademark clearance, registration, domain clearance, or marketplace clearance.

## Decision

1. **Repello is the customer-facing name.** New application copy, display configuration,
   repository-controlled public descriptions, support copy, and legal copy use Repello.
2. **Existing-user continuity takes priority over technical renaming.** The bundle identifier,
   Android package, App Store Connect app record and SKU, Expo slug and deep-link scheme, EAS project,
   Supabase project and schema, persisted storage keys, database identifiers, secret names, and the
   deferred store product/entitlement identifiers remain stable.
3. **Historical records are not rewritten.** Prior ADRs, sprints, research, architecture evidence,
   build records, and App Review context may continue to say PRism. “Formerly PRism” is added only
   where it materially improves traceability.
4. **Legacy data may receive a display alias.** The seeded routine stored as `Prism 3`, including its
   stable database/internal identifiers, is presented as “Repello 3” by the client. No migration or
   backend write is authorized by this decision.
5. **Future monetization remains deferred.** ADR-0005's optional non-consumable analysis unlock is
   inactive in the free-first resubmission. If a later version activates it, digital functionality
   sold in the iOS app must use Apple In-App Purchase and must pass a separately approved sprint.

## Intentionally stable technical identities

| Identity | Retained value or class | Reason |
|---|---|---|
| iOS bundle identifier | `app.prism.trainer` | Preserve App Store identity, signing, updates, and installed-app continuity. |
| Android package | `app.prism.trainer` | Preserve package identity and update continuity. |
| Expo slug and deep-link scheme | `prism` | Preserve project and existing-link continuity. |
| App Store Connect record and SKU | Existing owner-controlled record | The rename is metadata on the existing app, not a new app identity. |
| Supabase identities | Existing project, URL, schema, migrations, RLS, functions | A display rename does not authorize backend or data migration work. |
| Local storage and database identifiers | Existing `prism.*` keys, IDs, and names | Preserve upgrades and existing-user state. |
| Integration and secret names | Existing names, including `PRISM_INTEGRATION_*` | Avoid credential/configuration drift; names are not customer copy. |
| Deferred purchase contract | `app.prism.trainer.pro.lifetime` / `pro` | Preserve the accepted ADR-0005 contract without activating it. |

## Consequences

- The compiled display name and customer-visible copy can change without creating a new app or
  breaking existing installations.
- Repository searches will continue to find `prism` in technical and historical contexts. Those
  matches are intentional and must not be mass-renamed.
- App Store metadata, screenshots, review notes, public legal/support pages, and EAS artifacts are
  owner-controlled surfaces. Repository parity is necessary but cannot prove those surfaces were
  updated.
- The owner must obtain any desired legal/name advice independently. No product or store copy may
  claim trademark clearance based on this ADR.

## Owner-controlled work

Before resubmission, the owner must update and verify App Store Connect naming/metadata/screenshots,
publish and verify Repello legal/support copy at reachable public URLs, resolve the effective EAS
configuration for the exact accepted commit, build and test the exact candidate, and send the final
review response. The repository does not perform or prove any of those external actions.
