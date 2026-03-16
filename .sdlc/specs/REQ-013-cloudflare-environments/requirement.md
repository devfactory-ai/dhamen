---
id: REQ-011
title: Configuration des environnements Cloudflare
status: draft
priority: must
---

# Description

Le projet doit supporter plusieurs environnements de déploiement
afin de tester et livrer les fonctionnalités de manière sécurisée.

Trois environnements doivent être configurés sur Cloudflare :

- dev
- staging
- prod

Chaque environnement doit pouvoir être déployé indépendamment.

---

# Objectifs

- permettre le test des fonctionnalités sur dev
- valider les fonctionnalités sur staging
- livrer les versions stables sur prod

---

# Workflow

Développeur → dev

Validation → staging

Release → prod

---

# Outils

Les déploiements doivent utiliser :

- Cloudflare Workers
- wrangler CLI
- GitHub
- Claude Code

---

# Acceptance Criteria

AC1 : trois environnements Cloudflare existent (dev, staging, prod)

AC2 : chaque environnement possède sa configuration

AC3 : wrangler peut déployer vers chaque environnement

AC4 : Claude Code peut déclencher les déploiements

AC5 : GitHub peut être utilisé pour les commits