import { z } from 'zod';

/**
 * Schema for bulletin soins extended fields (format assureur)
 */
export const bulletinSoinsExtendedSchema = z.object({
  refBsPhysAss: z.string().nullable().default(null),
  refBsPhysClt: z.string().nullable().default(null),
  rangBs: z.number().int().min(0).nullable().default(null),
  rangPres: z.number().int().min(0).max(99).nullable().default(null),
  nomAdherent: z.string().nullable().default(null),
});

/**
 * Schema for acte bulletin extended fields (format assureur)
 */
export const acteBulletinExtendedSchema = z.object({
  nbrCle: z.number().int().positive().nullable().default(null),
  mntRevise: z.number().nullable().default(null),
  mntRedIfAvanc: z.number().nullable().default(null),
  mntActARegl: z.number().nullable().default(null),
  codMsgr: z.string().nullable().default(null),
  libMsgr: z.string().nullable().default(null),
  refProfSant: z.string().nullable().default(null),
  nomProfSant: z.string().nullable().default(null),
});

export type BulletinSoinsExtendedInput = z.infer<typeof bulletinSoinsExtendedSchema>;
export type ActeBulletinExtendedInput = z.infer<typeof acteBulletinExtendedSchema>;
