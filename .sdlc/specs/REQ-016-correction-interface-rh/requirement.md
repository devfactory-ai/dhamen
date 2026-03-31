# REQ-016 — Correction Interface Responsable RH

## Contexte
Le compte RH (Karim / Responsable RH) n'etait pas associe a une entreprise en DB.
Toutes les pages RH affichaient 0 ou vide, avec timeouts sur les APIs.

## Problemes resolus
- P-001: company_id manquant sur les comptes RH demo → migration 0121
- P-002: Timeout backend → stats endpoint resilient avec try/catch + safeCount
- P-003: Frontend lance requetes sans verifier entreprise → NoEntrepriseGuard
- P-004: Endpoints /contracts et /claims manquants → ajoutes dans companies.ts

## Fichiers modifies
- apps/api/src/routes/companies.ts — stats resilient + endpoints contracts/claims
- apps/web/src/features/hr-portal/components/NoEntrepriseGuard.tsx — nouveau
- apps/web/src/features/hr-portal/hooks/useRhGuard.ts — nouveau
- apps/web/src/features/hr-portal/pages/HRDashboardPage.tsx — NoEntrepriseGuard
- apps/web/src/features/hr-portal/pages/HRAdherentsPage.tsx — NoEntrepriseGuard
- apps/web/src/features/hr-portal/pages/HRContractsPage.tsx — NoEntrepriseGuard
- apps/web/src/features/hr-portal/pages/HRClaimsPage.tsx — NoEntrepriseGuard
- apps/web/src/lib/api-client.ts — timeout 30s → 10s
- packages/db/migrations/0121_fix_rh_company_association.sql — seed
