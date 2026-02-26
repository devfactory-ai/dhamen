/**
 * SoinFlow Carte Routes
 *
 * API endpoints for digital insurance card
 */
import { Hono } from 'hono';
import type { Bindings, Variables } from '../../types';
import { authMiddleware } from '../../middleware/auth';

const carte = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// All routes require authentication
carte.use('*', authMiddleware());

/**
 * GET /sante/carte
 * Get the current user's digital insurance card
 */
carte.get('/', async (c) => {
  const user = c.get('user');

  // In production, query D1 for adherent data
  // For now, return mock data based on user

  // Check if user has adherent role or is linked to an adherent
  const isAdherent =
    user.role === 'ADHERENT' ||
    user.role === 'PHARMACIST' ||
    user.role === 'DOCTOR';

  if (!isAdherent) {
    // Return mock adherent data for demo purposes
    const carte = {
      adherent: {
        id: 'ADH-001',
        matricule: `ADH-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}`,
        nom: user.lastName || 'Utilisateur',
        prenom: user.firstName || 'Test',
        dateNaissance: '1985-06-15',
        estActif: true,
      },
      assureur: {
        id: 'INS-001',
        nom: 'Assurances Maghreb',
        logo: null,
      },
      formule: {
        code: 'PREM-FAM',
        nom: 'Premium Famille',
        plafondGlobal: 50000000, // 50,000 TND
      },
      contrat: {
        numero: `CTR-${new Date().getFullYear()}-001`,
        dateDebut: `${new Date().getFullYear()}-01-01`,
        dateFin: `${new Date().getFullYear()}-12-31`,
        estActif: true,
      },
      qrCodeData: `dhamen://verify/${user.sub}`,
    };

    return c.json({
      success: true,
      data: carte,
    });
  }

  // Mock carte data for adherent
  const carte = {
    adherent: {
      id: user.sub,
      matricule: `ADH-${new Date().getFullYear()}-${String(user.sub.slice(-4)).padStart(4, '0')}`,
      nom: user.lastName || 'Ben Ali',
      prenom: user.firstName || 'Mohamed',
      dateNaissance: '1985-06-15',
      estActif: true,
    },
    assureur: {
      id: 'INS-001',
      nom: 'Assurances Maghreb',
      logo: null,
    },
    formule: {
      code: 'PREM-FAM',
      nom: 'Premium Famille',
      plafondGlobal: 50000000, // 50,000 TND in millimes
    },
    contrat: {
      numero: `CTR-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 999)).padStart(3, '0')}`,
      dateDebut: `${new Date().getFullYear()}-01-01`,
      dateFin: `${new Date().getFullYear()}-12-31`,
      estActif: true,
    },
    qrCodeData: `dhamen://verify/${user.sub}`,
  };

  return c.json({
    success: true,
    data: carte,
  });
});

/**
 * GET /sante/carte/verify/:code
 * Verify an adherent card by QR code data
 */
carte.get('/verify/:code', async (c) => {
  const code = c.req.param('code');

  // Parse the code (format: dhamen://verify/{userId} or just userId)
  const userId = code.replace('dhamen://verify/', '');

  // In production, query D1 for adherent data
  const verification = {
    estValide: true,
    adherent: {
      matricule: `ADH-${new Date().getFullYear()}-${String(userId.slice(-4)).padStart(4, '0')}`,
      nom: 'Ben Ali',
      prenom: 'Mohamed',
      estActif: true,
    },
    assureur: {
      nom: 'Assurances Maghreb',
    },
    formule: {
      nom: 'Premium Famille',
    },
    contrat: {
      estActif: true,
      dateFin: `${new Date().getFullYear()}-12-31`,
    },
    dateVerification: new Date().toISOString(),
  };

  return c.json({
    success: true,
    data: verification,
  });
});

export { carte };
