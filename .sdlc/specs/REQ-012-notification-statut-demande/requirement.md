# REQ-012 — Notifications detaillees sur changement de statut demande

## Contexte

Lorsqu'un gestionnaire assureur approuve ou rejette une demande de remboursement depuis le portail web, l'adherent mobile ne recoit aucune notification. Le systeme de notification existe (services, templates, push Expo, WebSocket, DB) mais n'est pas branche sur le workflow de changement de statut.

## Probleme

- L'endpoint `PATCH /sante/demandes/:id/statut` met a jour le statut sans declencher de notification.
- L'adherent doit ouvrir l'app et rafraichir manuellement pour voir le changement.
- Les templates push (`SANTE_DEMANDE_APPROUVEE`, `SANTE_DEMANDE_REJETEE`) existent dans `push-notification.service.ts` mais ne sont jamais appelees.
- Le service realtime (`realtime-notifications.service.ts`) n'est pas utilise lors des transitions de statut.

## Objectif

Envoyer des notifications detaillees (push + in-app + realtime) a l'adherent lorsque le statut de sa demande change, avec des informations contextuelles (montant rembourse, motif de rejet, numero de demande).

## Fonctionnalites

### Notifications a declencher

| Transition | Destinataire | Canaux | Contenu |
|------------|-------------|--------|---------|
| → approuvee | Adherent | Push + In-app + Realtime | Numero demande, montant rembourse, type de soin |
| → rejetee | Adherent | Push + In-app + Realtime | Numero demande, motif de rejet, suggestion action |
| → en_examen | Adherent | In-app + Realtime | Numero demande, message "en cours d'examen" |
| → info_requise | Adherent | Push + In-app + Realtime | Numero demande, details info manquante |
| → en_paiement | Adherent | In-app + Realtime | Numero demande, montant, delai estime |
| → payee | Adherent | Push + In-app + Realtime | Numero demande, montant verse, reference paiement |

### Contenu detaille des notifications

**Approbation** :
- Titre : "Demande {numeroDemande} approuvee"
- Corps : "Votre demande de {typeSoin} du {dateSoin} a ete approuvee. Montant rembourse : {montantRembourse} TND. Le paiement sera effectue sous {delaiPaiement} jours."

**Rejet** :
- Titre : "Demande {numeroDemande} rejetee"
- Corps : "Votre demande de {typeSoin} du {dateSoin} a ete rejetee. Motif : {motifRejet}. Vous pouvez contacter votre assureur ou soumettre une nouvelle demande."

**Info requise** :
- Titre : "Information requise pour {numeroDemande}"
- Corps : "Votre assureur a besoin d'informations supplementaires pour traiter votre demande de {typeSoin}. {detailsInfo}"

### Mobile — Affichage enrichi

- Notification push avec navigation directe vers le detail de la demande
- Ecran notifications : affichage du motif de rejet, montant rembourse, etc.
- Badge de notification mis a jour en temps reel
- Invalidation automatique du cache React Query sur reception

## Exigences non-fonctionnelles

- NF-001 : Notification envoyee < 5s apres le changement de statut
- NF-002 : Respecter les preferences utilisateur (quiet hours, canaux desactives)
- NF-003 : Fire-and-forget — l'echec de notification ne bloque pas le changement de statut
- NF-004 : Audit trail sur chaque notification envoyee
- NF-005 : Support multilingue (francais par defaut, arabe futur)

## Criteres d'acceptation

- AC-1 : L'approbation d'une demande declenche push + in-app + realtime vers l'adherent
- AC-2 : Le rejet inclut le motif detaille dans la notification
- AC-3 : Le tap sur la notification push ouvre le detail de la demande
- AC-4 : Les preferences utilisateur sont respectees (pas de push si desactive)
- AC-5 : L'ecran notifications affiche les details contextuels (montant, motif)
- AC-6 : Le badge se met a jour en temps reel via WebSocket
- AC-7 : L'echec de notification ne bloque pas le changement de statut (fire-and-forget)
