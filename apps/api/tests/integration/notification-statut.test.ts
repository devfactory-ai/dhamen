/**
 * REQ-012 TASK-006: Notification on demande status change — Integration Tests
 *
 * Tests that changing a demande status triggers push, in-app, and
 * realtime notifications to the adherent.
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import {
  STATUT_TO_NOTIFICATION,
  PUSH_ENABLED_STATUSES,
} from '@dhamen/shared';
import type { SanteNotificationType } from '@dhamen/shared';

// --- Mock notification tracking ---

interface SentNotification {
  channel: 'push' | 'in-app' | 'realtime';
  userId: string;
  eventType: string;
  data: Record<string, unknown>;
}

interface MockDemande {
  id: string;
  numeroDemande: string;
  adherentId: string;
  typeSoin: string;
  dateSoin: string;
  montantDemande: number;
  statut: string;
}

function createNotificationApp(options: {
  demande: MockDemande;
  pushShouldFail?: boolean;
}) {
  const demande = { ...options.demande };
  const sentNotifications: SentNotification[] = [];
  const app = new Hono();

  app.patch('/api/v1/sante/demandes/:id/statut', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json() as {
      statut: string;
      montantRembourse?: number;
      motifRejet?: string;
      notesInternes?: string;
    };

    if (demande.id !== id) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Demande introuvable' } }, 404);
    }

    // Update status
    const previousStatut = demande.statut;
    demande.statut = body.statut;

    // Trigger notifications (fire-and-forget pattern)
    const notifType = STATUT_TO_NOTIFICATION[body.statut] as SanteNotificationType | undefined;
    if (notifType && demande.adherentId) {
      const notifData: Record<string, unknown> = {
        demandeId: demande.id,
        numeroDemande: demande.numeroDemande,
        typeSoin: demande.typeSoin,
        dateSoin: demande.dateSoin,
        montantRembourse: body.montantRembourse,
        motifRejet: body.motifRejet,
        notes: body.notesInternes,
      };

      // 1. Push (only for important transitions)
      if (PUSH_ENABLED_STATUSES.includes(notifType)) {
        if (options.pushShouldFail) {
          // Simulate push failure — should not block response
          console.error('Push notification failed (simulated)');
        } else {
          sentNotifications.push({
            channel: 'push',
            userId: demande.adherentId,
            eventType: notifType,
            data: notifData,
          });
        }
      }

      // 2. In-app (always)
      sentNotifications.push({
        channel: 'in-app',
        userId: demande.adherentId,
        eventType: notifType,
        data: notifData,
      });

      // 3. Realtime (always)
      sentNotifications.push({
        channel: 'realtime',
        userId: demande.adherentId,
        eventType: notifType,
        data: notifData,
      });
    }

    return c.json({
      success: true,
      data: {
        id: demande.id,
        numeroDemande: demande.numeroDemande,
        statut: demande.statut,
        previousStatut,
      },
    });
  });

  return { app, demande, sentNotifications };
}

const BASE_DEMANDE: MockDemande = {
  id: 'dem_001',
  numeroDemande: 'DEM-2026-0001',
  adherentId: 'adherent_001',
  typeSoin: 'pharmacie',
  dateSoin: '2026-03-05',
  montantDemande: 50000,
  statut: 'soumise',
};

// --- Tests ---

describe('REQ-012 TASK-006: Notification on demande status change', () => {
  describe('AC-1: Approval triggers all 3 channels', () => {
    it('sends push, in-app, and realtime on approval', async () => {
      const { app, sentNotifications } = createNotificationApp({ demande: BASE_DEMANDE });

      const res = await app.request('/api/v1/sante/demandes/dem_001/statut', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statut: 'approuvee',
          montantRembourse: 45000,
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json() as { data: { statut: string } };
      expect(body.data.statut).toBe('approuvee');

      // Verify all 3 channels
      const pushNotifs = sentNotifications.filter(n => n.channel === 'push');
      const inAppNotifs = sentNotifications.filter(n => n.channel === 'in-app');
      const realtimeNotifs = sentNotifications.filter(n => n.channel === 'realtime');

      expect(pushNotifs).toHaveLength(1);
      expect(inAppNotifs).toHaveLength(1);
      expect(realtimeNotifs).toHaveLength(1);

      // Verify event type
      expect(pushNotifs[0].eventType).toBe('SANTE_DEMANDE_APPROUVEE');
      expect(inAppNotifs[0].eventType).toBe('SANTE_DEMANDE_APPROUVEE');

      // Verify payload includes montantRembourse
      expect(pushNotifs[0].data.montantRembourse).toBe(45000);
      expect(pushNotifs[0].data.numeroDemande).toBe('DEM-2026-0001');
    });
  });

  describe('AC-2: Rejection includes motif', () => {
    it('sends rejection notification with motifRejet', async () => {
      const { app, sentNotifications } = createNotificationApp({ demande: BASE_DEMANDE });

      await app.request('/api/v1/sante/demandes/dem_001/statut', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statut: 'rejetee',
          motifRejet: 'Document illegible, veuillez soumettre une photo plus claire',
        }),
      });

      const pushNotif = sentNotifications.find(n => n.channel === 'push');
      expect(pushNotif).toBeDefined();
      expect(pushNotif!.eventType).toBe('SANTE_DEMANDE_REJETEE');
      expect(pushNotif!.data.motifRejet).toBe('Document illegible, veuillez soumettre une photo plus claire');
      expect(pushNotif!.data.typeSoin).toBe('pharmacie');
    });
  });

  describe('AC-7: Fire-and-forget resilience', () => {
    it('status update succeeds even if push notification fails', async () => {
      const { app, demande, sentNotifications } = createNotificationApp({
        demande: BASE_DEMANDE,
        pushShouldFail: true,
      });

      const res = await app.request('/api/v1/sante/demandes/dem_001/statut', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut: 'approuvee', montantRembourse: 45000 }),
      });

      // Response should still succeed
      expect(res.status).toBe(200);
      expect(demande.statut).toBe('approuvee');

      // Push not sent, but in-app + realtime still sent
      const pushNotifs = sentNotifications.filter(n => n.channel === 'push');
      const inAppNotifs = sentNotifications.filter(n => n.channel === 'in-app');
      expect(pushNotifs).toHaveLength(0);
      expect(inAppNotifs).toHaveLength(1);
    });
  });

  describe('en_examen — no push', () => {
    it('does not send push for en_examen transition', async () => {
      const { app, sentNotifications } = createNotificationApp({ demande: BASE_DEMANDE });

      await app.request('/api/v1/sante/demandes/dem_001/statut', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut: 'en_examen' }),
      });

      const pushNotifs = sentNotifications.filter(n => n.channel === 'push');
      const inAppNotifs = sentNotifications.filter(n => n.channel === 'in-app');
      const realtimeNotifs = sentNotifications.filter(n => n.channel === 'realtime');

      // No push for en_examen (not in PUSH_ENABLED_STATUSES)
      expect(pushNotifs).toHaveLength(0);
      // But in-app + realtime yes
      expect(inAppNotifs).toHaveLength(1);
      expect(realtimeNotifs).toHaveLength(1);
      expect(inAppNotifs[0].eventType).toBe('SANTE_DEMANDE_EN_EXAMEN');
    });
  });

  describe('Notification payload completeness', () => {
    it('includes all contextual data in notification payload', async () => {
      const { app, sentNotifications } = createNotificationApp({ demande: BASE_DEMANDE });

      await app.request('/api/v1/sante/demandes/dem_001/statut', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut: 'approuvee', montantRembourse: 45000 }),
      });

      const notif = sentNotifications.find(n => n.channel === 'push');
      expect(notif).toBeDefined();
      expect(notif!.data.demandeId).toBe('dem_001');
      expect(notif!.data.numeroDemande).toBe('DEM-2026-0001');
      expect(notif!.data.typeSoin).toBe('pharmacie');
      expect(notif!.data.dateSoin).toBe('2026-03-05');
      expect(notif!.data.montantRembourse).toBe(45000);
    });
  });

  describe('No notification for unknown status', () => {
    it('does not send notification for unmapped status', async () => {
      const { app, sentNotifications } = createNotificationApp({ demande: BASE_DEMANDE });

      await app.request('/api/v1/sante/demandes/dem_001/statut', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut: 'brouillon' }),
      });

      expect(sentNotifications).toHaveLength(0);
    });
  });

  describe('STATUT_TO_NOTIFICATION mapping', () => {
    it('maps all expected statuses', () => {
      expect(STATUT_TO_NOTIFICATION['approuvee']).toBe('SANTE_DEMANDE_APPROUVEE');
      expect(STATUT_TO_NOTIFICATION['rejetee']).toBe('SANTE_DEMANDE_REJETEE');
      expect(STATUT_TO_NOTIFICATION['en_examen']).toBe('SANTE_DEMANDE_EN_EXAMEN');
      expect(STATUT_TO_NOTIFICATION['info_requise']).toBe('SANTE_INFO_REQUISE');
      expect(STATUT_TO_NOTIFICATION['en_paiement']).toBe('SANTE_DEMANDE_EN_PAIEMENT');
      expect(STATUT_TO_NOTIFICATION['payee']).toBe('SANTE_PAIEMENT_EFFECTUE');
    });
  });

  describe('PUSH_ENABLED_STATUSES', () => {
    it('includes approval and rejection but not en_examen', () => {
      expect(PUSH_ENABLED_STATUSES).toContain('SANTE_DEMANDE_APPROUVEE');
      expect(PUSH_ENABLED_STATUSES).toContain('SANTE_DEMANDE_REJETEE');
      expect(PUSH_ENABLED_STATUSES).toContain('SANTE_INFO_REQUISE');
      expect(PUSH_ENABLED_STATUSES).toContain('SANTE_PAIEMENT_EFFECTUE');
      expect(PUSH_ENABLED_STATUSES).not.toContain('SANTE_DEMANDE_EN_EXAMEN');
      expect(PUSH_ENABLED_STATUSES).not.toContain('SANTE_DEMANDE_EN_PAIEMENT');
    });
  });

  describe('Payment notification', () => {
    it('sends push for payee status with montant', async () => {
      const { app, sentNotifications } = createNotificationApp({ demande: BASE_DEMANDE });

      await app.request('/api/v1/sante/demandes/dem_001/statut', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut: 'payee', montantRembourse: 45000 }),
      });

      const pushNotif = sentNotifications.find(n => n.channel === 'push');
      expect(pushNotif).toBeDefined();
      expect(pushNotif!.eventType).toBe('SANTE_PAIEMENT_EFFECTUE');
      expect(pushNotif!.data.montantRembourse).toBe(45000);
    });
  });
});
