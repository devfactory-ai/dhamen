-- Migration: Seed adherent user accounts
-- Description: Create user accounts for adherents (demo/testing purposes)
-- Password hash is for "adherent123" using PBKDF2-SHA256 (100k iterations)

-- ============================================
-- ADHERENT USER ACCOUNTS (10 demo accounts)
-- ============================================

-- Link user accounts to existing adherents
-- These users can log in to the mobile app / portal with role ADHERENT

INSERT OR IGNORE INTO users (id, email, password_hash, role, provider_id, insurer_id, company_id, first_name, last_name, phone, mfa_enabled, is_active) VALUES
-- Mohamed Ben Salah - Adherent with STAR contract
('01JCVMKC2AP2N3X4Y5Z6A7B8C9', 'mohamed.bensalah@email.tn', '$pbkdf2$100000$qpVIbyGwiladDZsfFG7rWg==$JLAJs+t8U6vWbHNYwKNxfArAUS46ufcAo+b6Yag7TI8=', 'ADHERENT', NULL, NULL, NULL, 'Mohamed', 'Ben Salah', '+21698765432', 0, 1),

-- Fatma Trabelsi - Adherent with STAR family contract
('01JCVMKC2BP2N3X4Y5Z6A7B8D0', 'fatma.trabelsi@email.tn', '$pbkdf2$100000$qpVIbyGwiladDZsfFG7rWg==$JLAJs+t8U6vWbHNYwKNxfArAUS46ufcAo+b6Yag7TI8=', 'ADHERENT', NULL, NULL, NULL, 'Fatma', 'Trabelsi', '+21697654321', 0, 1),

-- Ahmed Bouazizi - Adherent with GAT contract
('01JCVMKC2CP2N3X4Y5Z6A7B8E1', 'ahmed.bouazizi@email.tn', '$pbkdf2$100000$qpVIbyGwiladDZsfFG7rWg==$JLAJs+t8U6vWbHNYwKNxfArAUS46ufcAo+b6Yag7TI8=', 'ADHERENT', NULL, NULL, NULL, 'Ahmed', 'Bouazizi', '+21696543210', 0, 1),

-- Leila Hammami - Adherent with GAT corporate contract
('01JCVMKC2DP2N3X4Y5Z6A7B8F2', 'leila.hammami@email.tn', '$pbkdf2$100000$qpVIbyGwiladDZsfFG7rWg==$JLAJs+t8U6vWbHNYwKNxfArAUS46ufcAo+b6Yag7TI8=', 'ADHERENT', NULL, NULL, NULL, 'Leila', 'Hammami', '+21695432109', 0, 1),

-- Karim Jebali - Adherent with COMAR contract
('01JCVMKC2EP2N3X4Y5Z6A7B8G3', 'karim.jebali@email.tn', '$pbkdf2$100000$qpVIbyGwiladDZsfFG7rWg==$JLAJs+t8U6vWbHNYwKNxfArAUS46ufcAo+b6Yag7TI8=', 'ADHERENT', NULL, NULL, NULL, 'Karim', 'Jebali', '+21694321098', 0, 1),

-- Sonia Chahed - Adherent with COMAR family contract
('01JCVMKC2FP2N3X4Y5Z6A7B8H4', 'sonia.chahed@email.tn', '$pbkdf2$100000$qpVIbyGwiladDZsfFG7rWg==$JLAJs+t8U6vWbHNYwKNxfArAUS46ufcAo+b6Yag7TI8=', 'ADHERENT', NULL, NULL, NULL, 'Sonia', 'Chahed', '+21693210987', 0, 1),

-- Youssef Mekni - Adherent with AMI contract
('01JCVMKC2GP2N3X4Y5Z6A7B8I5', 'youssef.mekni@email.tn', '$pbkdf2$100000$qpVIbyGwiladDZsfFG7rWg==$JLAJs+t8U6vWbHNYwKNxfArAUS46ufcAo+b6Yag7TI8=', 'ADHERENT', NULL, NULL, NULL, 'Youssef', 'Mekni', '+21692109876', 0, 1),

-- Amira Saidi - Adherent with AMI corporate contract
('01JCVMKC2HP2N3X4Y5Z6A7B8J6', 'amira.saidi@email.tn', '$pbkdf2$100000$qpVIbyGwiladDZsfFG7rWg==$JLAJs+t8U6vWbHNYwKNxfArAUS46ufcAo+b6Yag7TI8=', 'ADHERENT', NULL, NULL, NULL, 'Amira', 'Saidi', '+21691098765', 0, 1),

-- Hichem Ferchichi - Adherent with STAR contract
('01JCVMKC2IP2N3X4Y5Z6A7B8K7', 'hichem.ferchichi@email.tn', '$pbkdf2$100000$qpVIbyGwiladDZsfFG7rWg==$JLAJs+t8U6vWbHNYwKNxfArAUS46ufcAo+b6Yag7TI8=', 'ADHERENT', NULL, NULL, NULL, 'Hichem', 'Ferchichi', '+21690987654', 0, 1),

-- Nadia Ghannouchi - Adherent with STAR family contract
('01JCVMKC2JP2N3X4Y5Z6A7B8L8', 'nadia.ghannouchi@email.tn', '$pbkdf2$100000$qpVIbyGwiladDZsfFG7rWg==$JLAJs+t8U6vWbHNYwKNxfArAUS46ufcAo+b6Yag7TI8=', 'ADHERENT', NULL, NULL, NULL, 'Nadia', 'Ghannouchi', '+21689876543', 0, 1);

-- ============================================
-- LINK ADHERENTS TO USER ACCOUNTS
-- Update adherents table with user_id foreign key if it exists
-- ============================================

-- Note: If your adherents table has a user_id column, uncomment and run these:
-- UPDATE adherents SET user_id = '01JCVMKC2AP2N3X4Y5Z6A7B8C9' WHERE id = '01JCVMKA1AP2N3X4Y5Z6A7B8C9';
-- UPDATE adherents SET user_id = '01JCVMKC2BP2N3X4Y5Z6A7B8D0' WHERE id = '01JCVMKA1BP2N3X4Y5Z6A7B8D0';
-- ... etc
