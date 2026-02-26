/**
 * Routes index
 */

export { health } from './health';
export { auth } from './auth';
export { providers } from './providers';
export { adherents } from './adherents';
export { contracts } from './contracts';
export { insurers } from './insurers';
export { claims } from './claims';
export { notifications } from './notifications';
export { bordereaux } from './bordereaux';

// Agent routes
export { default as eligibility } from './eligibility';
export { default as tarification } from './tarification';
export { default as fraud } from './fraud';
export { reconciliation } from './reconciliation';

// SoinFlow routes
export { sante } from './sante';

// Webhooks and Public API
export { webhooks } from './webhooks';
export { publicApi } from './public-api';

// Realtime, Exports, and Compliance
export { realtime } from './realtime';
export { exports } from './exports';
export { compliance } from './compliance';

// OCR
export { ocr } from './ocr';

// CNAM Integration
export { cnam } from './cnam';
