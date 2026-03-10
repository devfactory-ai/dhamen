# Architecture — REQ-012 Notifications statut demande

## ADR-001 : Brancher les notifications dans le endpoint existant PATCH /statut

### Decision

Ajouter les appels de notification directement dans le handler `PATCH /sante/demandes/:id/statut` existant, en fire-and-forget (`.catch(() => {})`), apres la mise a jour du statut.

### Rationale

- Le endpoint existe deja et gere les transitions de statut avec validation RBAC et audit trail.
- Les services `PushNotificationService`, `NotificationService`, et `RealtimeNotificationsService` sont deja instancies et disponibles dans le contexte Hono.
- Le pattern fire-and-forget est deja utilise pour les evenements queue OCR (REQ-011 TASK-004).
- Alternative rejetee : passer par la queue Cloudflare — ajouterait de la latence et de la complexite pour un gain minimal (les services de notification gerent deja les erreurs).

### Impact

- **API** : ~30 lignes ajoutees dans `demandes.ts` apres la mise a jour du statut.
- **Risque** : Nul — fire-and-forget, pas d'impact sur le flux principal.

---

## ADR-002 : Utiliser les 3 canaux existants (push + in-app + realtime)

### Decision

Envoyer les notifications sur les 3 canaux simultanement :
1. **Push** via `PushNotificationService.sendSanteNotification()` (Expo Push)
2. **In-app** via `NotificationService.send()` (stockage DB + lecture ulterieure)
3. **Realtime** via `RealtimeNotificationsService.sendToUser()` (WebSocket Durable Object)

### Rationale

- Les 3 services existent et sont fonctionnels.
- Push : notification meme si l'app est fermee.
- In-app : historique persistant consultable dans l'ecran notifications.
- Realtime : mise a jour instantanee si l'app est ouverte (badge, cache invalidation).
- Les preferences utilisateur sont verifiees par `NotificationService` (quiet hours, canaux desactives).

### Impact

- **API** : Appel parallele des 3 services.
- **Risque** : Faible — chaque service gere ses propres erreurs independamment.

---

## ADR-003 : Enrichir les templates push existants avec des donnees contextuelles

### Decision

Les templates `SANTE_DEMANDE_APPROUVEE` et `SANTE_DEMANDE_REJETEE` existent deja dans `push-notification.service.ts`. Les enrichir avec des variables supplementaires : `montantRembourse`, `motifRejet`, `typeSoin`, `dateSoin`.

### Rationale

- Les templates actuels utilisent deja des variables (`{numeroDemande}`, `{montantRembourse}`, `{motifRejet}`).
- Ajouter `typeSoin` et `dateSoin` permet un message plus complet sans changer la structure.
- Le format Expo Push supporte `title` + `body` + `data` (payload JSON pour navigation).

### Impact

- **API** : Modification des templates dans `push-notification.service.ts`.
- **Risque** : Nul — extension des templates existants.

---

## ADR-004 : Ajouter les types d'evenements notification dans packages/shared

### Decision

Definir les types d'evenements de notification dans `packages/shared/src/types/events.ts` pour garantir la coherence entre API, web et mobile.

### Rationale

- Actuellement, `events.ts` ne contient que les evenements OCR.
- Les types de notification sont definis en dur dans les services (strings).
- Un type partage evite les desynchronisations entre les templates API et le handling mobile.

### Impact

- **Shared** : Ajout de types `DemandeNotificationEvent` dans `events.ts`.
- **Risque** : Nul — ajout de types.

---

## ADR-005 : Navigation directe depuis la notification push

### Decision

Inclure le `demandeId` dans le payload `data` de la notification push. Le hook `usePushNotifications` redirige deja vers `/(main)/demandes/{entityId}` pour les notifications `SANTE_DEMANDE_*`.

### Rationale

- Le hook mobile gere deja la navigation sur tap (`Notifications.addNotificationResponseReceivedListener`).
- Le pattern de navigation par `entityId` dans le payload `data` est en place.
- Aucun changement cote mobile necessaire pour la navigation de base.

### Impact

- **Mobile** : Aucun changement pour la navigation basique.
- **Risque** : Nul — mecanisme existant.

---

## ADR-006 : Invalider le cache React Query sur notification realtime

### Decision

Le hook `useRealtimeNotifications` invalide deja les queries `sante-demandes` sur reception d'une notification de type `demande`. Ajouter l'invalidation de la query specifique `['demande', demandeId]` pour rafraichir le detail.

### Rationale

- L'invalidation de la liste `sante-demandes` est en place.
- Invalider aussi le detail specifique permet un rafraichissement immediat si l'adherent est sur l'ecran de detail.
- Le `demandeId` est disponible dans le payload WebSocket.

### Impact

- **Mobile** : ~5 lignes dans `useRealtimeNotifications.ts`.
- **Risque** : Nul — extension du pattern existant.

---

## Synthese des fichiers impactes

| Fichier | Type de changement |
|---------|-------------------|
| `apps/api/src/routes/sante/demandes.ts` | Modification — ajout declenchement notifications |
| `apps/api/src/services/push-notification.service.ts` | Modification — enrichir templates |
| `packages/shared/src/types/events.ts` | Modification — ajout types notification |
| `apps/mobile/src/hooks/useRealtimeNotifications.ts` | Modification — invalidation cache detail |
| `apps/mobile/src/app/(main)/notifications.tsx` | Modification — affichage details enrichis |
| `apps/api/tests/integration/notification-statut.test.ts` | Nouveau — tests integration |

## Diagramme de flux

```
[Web — Gestionnaire]                     [API]                           [Mobile — Adherent]
       |                                   |                                    |
       |-- PATCH /demandes/:id/statut --->|                                    |
       |   { statut: 'approuvee',         |                                    |
       |     montantRembourse: 45000,     |                                    |
       |     notes: '...' }              |                                    |
       |                                   |                                    |
       |                                   |-- 1. Update DB statut             |
       |                                   |-- 2. Audit trail                  |
       |<-- 200 OK -----------------------|                                    |
       |                                   |                                    |
       |                            [Fire & forget]                            |
       |                                   |                                    |
       |                                   |-- 3a. Push (Expo) --------------->|  [Push notification]
       |                                   |-- 3b. In-app (DB) -------------->|  [Notification stockee]
       |                                   |-- 3c. Realtime (WS) ------------>|  [Badge + cache invalidation]
       |                                   |                                    |
       |                                   |                            [Adherent tape notification]
       |                                   |                                    |
       |                                   |                            --> Detail demande
       |                                   |                                montant, motif, statut
```
