-- Migration: Link companies to their insurers
-- Fixes FORBIDDEN error on batches endpoint (companies.insurer_id was NULL)
-- Mapping:
--   Tunisie Telecom  → STAR
--   BIAT             → GAT
--   Groupe Poulina   → COMAR
--   Clinique Oliviers → AMI
--   Carrefour Tunisie → STAR

UPDATE companies SET insurer_id = '01JCVMK8R7P2N3X4Y5Z6A7B8C9'
WHERE id = '01JCVMKC3AP2N3X4Y5Z6A7B8C9';
-- Tunisie Telecom → STAR

UPDATE companies SET insurer_id = '01JCVMK8R7P2N3X4Y5Z6A7B8D0'
WHERE id = '01JCVMKC3BP2N3X4Y5Z6A7B8D0';
-- BIAT → GAT

UPDATE companies SET insurer_id = '01JCVMK8R7P2N3X4Y5Z6A7B8E1'
WHERE id = '01JCVMKC3CP2N3X4Y5Z6A7B8E1';
-- Groupe Poulina → COMAR

UPDATE companies SET insurer_id = '01JCVMK8R7P2N3X4Y5Z6A7B8F2'
WHERE id = '01JCVMKC3DP2N3X4Y5Z6A7B8F2';
-- Clinique les Oliviers → AMI

UPDATE companies SET insurer_id = '01JCVMK8R7P2N3X4Y5Z6A7B8C9'
WHERE id = '01JCVMKC3EP2N3X4Y5Z6A7B8G3';
-- Carrefour Tunisie → STAR
