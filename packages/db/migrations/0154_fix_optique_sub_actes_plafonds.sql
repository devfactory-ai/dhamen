-- Fix optique sub-actes: plafonds supprimés (viennent du contrat via sub_limits_json, pas hardcodés)

UPDATE actes_referentiel SET plafond_acte = NULL WHERE code IN ('MONTURE', 'VERRES', 'LENTILLES', 'DOUBLES_FOYERS');
