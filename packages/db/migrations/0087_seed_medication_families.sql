-- Seed medication families (familles therapeutiques courantes en Tunisie)
-- These are the standard therapeutic categories used by PCT and CNAM

INSERT OR IGNORE INTO medication_families (id, code, name, name_ar, description, is_active, created_at, updated_at)
VALUES
  ('mf_001', 'ATB', 'Antibiotiques', 'مضادات حيوية', 'Antibacteriens, antifongiques, antiparasitaires', 1, datetime('now'), datetime('now')),
  ('mf_002', 'ATV', 'Antiviraux', 'مضادات الفيروسات', 'Antiviraux et antiretroviraux', 1, datetime('now'), datetime('now')),
  ('mf_003', 'AIF', 'Anti-inflammatoires', 'مضادات الالتهاب', 'AINS et corticoides', 1, datetime('now'), datetime('now')),
  ('mf_004', 'ANT', 'Antalgiques', 'مسكنات الألم', 'Analgesiques et antipyretiques', 1, datetime('now'), datetime('now')),
  ('mf_005', 'CVS', 'Cardiovasculaire', 'أدوية القلب والأوعية', 'Antihypertenseurs, antiarythmiques, vasodilatateurs', 1, datetime('now'), datetime('now')),
  ('mf_006', 'DIA', 'Antidiabetiques', 'أدوية السكري', 'Insulines, antidiabetiques oraux', 1, datetime('now'), datetime('now')),
  ('mf_007', 'GAS', 'Gastro-enterologie', 'أدوية الجهاز الهضمي', 'Antiacides, antiemetiques, laxatifs', 1, datetime('now'), datetime('now')),
  ('mf_008', 'PNE', 'Pneumologie', 'أدوية الجهاز التنفسي', 'Bronchodilatateurs, antitussifs, antihistaminiques', 1, datetime('now'), datetime('now')),
  ('mf_009', 'NEU', 'Neurologie-Psychiatrie', 'أدوية الأعصاب والنفسية', 'Anxiolytiques, antidepresseurs, antiepileptiques', 1, datetime('now'), datetime('now')),
  ('mf_010', 'DER', 'Dermatologie', 'أدوية الجلد', 'Topiques, antifongiques cutanes, emollients', 1, datetime('now'), datetime('now')),
  ('mf_011', 'OPH', 'Ophtalmologie', 'أدوية العيون', 'Collyres, pommades ophtalmiques', 1, datetime('now'), datetime('now')),
  ('mf_012', 'ORL', 'ORL', 'أدوية الأنف والأذن والحنجرة', 'Gouttes nasales et auriculaires', 1, datetime('now'), datetime('now')),
  ('mf_013', 'GYN', 'Gynecologie', 'أدوية النساء', 'Contraceptifs, hormones, ovules', 1, datetime('now'), datetime('now')),
  ('mf_014', 'URO', 'Urologie-Nephrologie', 'أدوية المسالك البولية', 'Diuretiques, alpha-bloquants', 1, datetime('now'), datetime('now')),
  ('mf_015', 'RHU', 'Rhumatologie', 'أدوية الروماتيزم', 'Antigoutteux, anti-arthrosiques', 1, datetime('now'), datetime('now')),
  ('mf_016', 'HEM', 'Hematologie', 'أدوية الدم', 'Anticoagulants, antianemiques, fer', 1, datetime('now'), datetime('now')),
  ('mf_017', 'VIT', 'Vitamines-Supplements', 'فيتامينات ومكملات', 'Vitamines, mineraux, complements alimentaires', 1, datetime('now'), datetime('now')),
  ('mf_018', 'VAC', 'Vaccins-Serums', 'لقاحات وأمصال', 'Vaccins et immunoglobulines', 1, datetime('now'), datetime('now')),
  ('mf_019', 'ONC', 'Oncologie', 'أدوية السرطان', 'Antineoplasiques, immunosuppresseurs', 1, datetime('now'), datetime('now')),
  ('mf_020', 'END', 'Endocrinologie', 'أدوية الغدد الصماء', 'Hormones thyroidiennes, corticoides systemiques', 1, datetime('now'), datetime('now'));
