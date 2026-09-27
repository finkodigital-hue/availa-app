# Assisted salon migration runbook

Status: operational template for a done-for-you migration. Use only after a salon has authorised the work in writing and the controller/processor terms cover it. Never accept an unprotected export by an ad-hoc channel or retain it as a test fixture.

## Scope and instruction

Record the salon legal name, authorised contact, source system, authorised data types, excluded data, migration window, old-system access end date, retention/deletion instruction and Bookzenvo operator. Health notes, free text, payment-card data and marketing permissions require separate explicit treatment; exclude them unless the approved process genuinely supports them.

## Preparation

1. Sign/accept the service terms and DPA; record the salon's instruction and lawful source.
2. Agree a secure transfer channel, permitted operators and deletion deadline. Never request source-system passwords.
3. Ask for the smallest usable export: active services/staff, client contact fields and future appointments. Agree whether historic appointments are necessary.
4. Take a source-system count/export manifest and checksum. Keep the old system authoritative during preparation.
5. Rehearse the column mapping and validation with synthetic rows in a non-production environment.

## Dry run and reconciliation

| Record type | Source count | Accepted | Rejected | Duplicate/merged | Manual decision | Owner sign-off |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| Services/categories |  |  |  |  |  |  |
| Staff/availability |  |  |  |  |  |  |
| Customers |  |  |  |  |  |  |
| Future appointments |  |  |  |  |  |  |
| Other approved records |  |  |  |  |  |  |

Check timezone, currency, tax/price display, service duration and gaps, staff assignment, overlapping appointments, cancelled/no-show status, contact normalisation, duplicates and outbound suppression. Imported permission or consent fields must not be inferred from the presence of an email/phone number.

## Cutover

1. Freeze or record the final source-system change point.
2. Import the approved final file with outbound email/SMS/review requests suppressed.
3. Reconcile counts and sample records with the salon owner, including first/last future appointment and each staff diary. Use private evidence without copying client data into tickets.
4. Keep the old diary available read-only or in a short agreed parallel period. Make the source of truth and rules for changes explicit to staff.
5. Enable the public page and selected messages/payments only after the salon approves the migrated configuration and each provider gate is complete.

## Rollback and deletion

Rollback triggers include material count mismatch, wrong local times/staff, duplicates, unexpected messages, unprotected sensitive data or inability to identify the authoritative diary. Stop imports, keep the old system authoritative and remove/re-import only under a recorded plan that preserves audit/payment history.

After acceptance, securely delete local/downloaded/export copies and temporary mapping files by the agreed date. Record deletion from operator devices, transfer storage and temporary cloud locations; account for backups/provider retention. Supply the salon with a final reconciliation and explain its continuing right to export its Bookzenvo data.

## Completion record

Record release, importer version, source/export references, checksums, counts, exceptions, suppression state, parallel period, salon approval, deletion proof, unresolved items and support contacts. A successful import does not authorise marketing or prove data accuracy beyond the checks recorded.

