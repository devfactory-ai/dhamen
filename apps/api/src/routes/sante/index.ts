/**
 * SoinFlow routes aggregator
 */
import { Hono } from 'hono';
import type { Bindings, Variables } from '../../types';

import { demandes } from './demandes';
import { praticiens } from './praticiens';
import { garanties } from './garanties';

const sante = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Mount sub-routes
sante.route('/demandes', demandes);
sante.route('/praticiens', praticiens);
sante.route('/garanties', garanties);

export { sante };
