/**
 * SoinFlow routes aggregator
 */
import { Hono } from 'hono';
import type { Bindings, Variables } from '../../types';

import { demandes } from './demandes';
import { praticiens } from './praticiens';
import { garanties } from './garanties';
import { documents } from './documents';
import { actes } from './actes';
import { paiements } from './paiements';
import { bordereaux } from './bordereaux';
import { eligibility } from './eligibility';
import { profil } from './profil';
import { notifications } from './notifications';
import { stats } from './stats';
import { exports } from './exports';
import { workflows } from './workflows';
import { realtime } from './realtime';

const sante = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Mount sub-routes
sante.route('/demandes', demandes);
sante.route('/praticiens', praticiens);
sante.route('/garanties', garanties);
sante.route('/documents', documents);
sante.route('/actes', actes);
sante.route('/paiements', paiements);
sante.route('/bordereaux', bordereaux);
sante.route('/eligibility', eligibility);
sante.route('/profil', profil);
sante.route('/notifications', notifications);
sante.route('/stats', stats);
sante.route('/exports', exports);
sante.route('/workflows', workflows);
sante.route('/realtime', realtime);

export { sante };
