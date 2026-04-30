export { calculateActe, calculateBulletin } from './engine';
export { toMillimes, toDinars } from './units';
export { checkEligibility } from './eligibility';
export { calculerRemboursementViaEngine } from './adapter';
export type {
  Acte,
  ActeResult,
  AnnualContext,
  Beneficiaire,
  BulletinResult,
  Contract,
  Guarantee,
  PlafondType,
  StrategyType,
} from './types';
export {
  MissingLetterKeyError,
  NoGuaranteeError,
  NoStrategyError,
} from './types';
