/**
 * Extended bulletin types for insurer bordereau format (REQ-009)
 */

export interface BulletinSoinsExtended {
  id: string;
  adherentId: string;
  beneficiaryId: string | null;
  bulletinNumber: string;
  bulletinDate: string;
  providerName: string | null;
  providerSpecialty: string | null;
  careType: string;
  careDescription: string | null;
  totalAmount: number | null;
  reimbursedAmount: number | null;
  status: string;
  submissionDate: string;
  // Champs format assureur
  refBsPhysAss: string | null;
  refBsPhysClt: string | null;
  rangBs: number | null;
  rangPres: number | null;
  nomAdherent: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ActeBulletinExtended {
  id: string;
  bulletinId: string;
  code: string | null;
  label: string;
  amount: number;
  // Champs format assureur
  nbrCle: number | null;
  mntRevise: number | null;
  mntRedIfAvanc: number | null;
  mntActARegl: number | null;
  codMsgr: string | null;
  libMsgr: string | null;
  refProfSant: string | null;
  nomProfSant: string | null;
  createdAt: string;
}
