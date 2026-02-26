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

const sante = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Mount sub-routes
sante.route('/demandes', demandes);
sante.route('/praticiens', praticiens);
sante.route('/garanties', garanties);
sante.route('/documents', documents);
sante.route('/actes', actes);

export { sante };
