-- Champs additionnels sur bulletins_soins pour format assureur
ALTER TABLE bulletins_soins ADD COLUMN ref_bs_phys_ass TEXT;
ALTER TABLE bulletins_soins ADD COLUMN ref_bs_phys_clt TEXT;
ALTER TABLE bulletins_soins ADD COLUMN rang_bs INTEGER;
ALTER TABLE bulletins_soins ADD COLUMN rang_pres INTEGER;
ALTER TABLE bulletins_soins ADD COLUMN nom_adherent TEXT;

-- Champs additionnels sur actes_bulletin pour format assureur
ALTER TABLE actes_bulletin ADD COLUMN nbr_cle INTEGER;
ALTER TABLE actes_bulletin ADD COLUMN mnt_revise REAL;
ALTER TABLE actes_bulletin ADD COLUMN mnt_red_if_avanc REAL;
ALTER TABLE actes_bulletin ADD COLUMN mnt_act_a_regl REAL;
ALTER TABLE actes_bulletin ADD COLUMN cod_msgr TEXT;
ALTER TABLE actes_bulletin ADD COLUMN lib_msgr TEXT;
ALTER TABLE actes_bulletin ADD COLUMN ref_prof_sant TEXT;
ALTER TABLE actes_bulletin ADD COLUMN nom_prof_sant TEXT;
