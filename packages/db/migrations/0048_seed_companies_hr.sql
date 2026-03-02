-- Seed data for companies and HR users

-- Sample companies (Tunisian companies)
INSERT OR IGNORE INTO companies (id, name, matricule_fiscal, address, city, phone, email, sector, employee_count, is_active) VALUES
('01JCVMKC3AP2N3X4Y5Z6A7B8C9', 'Tunisie Telecom', '123456ABC', 'Rue de la Liberte', 'Tunis', '+21671123456', 'contact@tunisietelecom.tn', 'IT', 5000, 1),
('01JCVMKC3BP2N3X4Y5Z6A7B8D0', 'BIAT - Banque Internationale Arabe de Tunisie', '234567BCD', 'Avenue Habib Bourguiba', 'Tunis', '+21671234567', 'rh@biat.com.tn', 'BANKING', 3000, 1),
('01JCVMKC3CP2N3X4Y5Z6A7B8E1', 'Groupe Poulina', '345678CDE', 'Zone Industrielle Ben Arous', 'Ben Arous', '+21671345678', 'hr@poulina.tn', 'MANUFACTURING', 8000, 1),
('01JCVMKC3DP2N3X4Y5Z6A7B8F2', 'Clinique les Oliviers', '456789DEF', 'Route de Sfax', 'Sousse', '+21673456789', 'direction@oliviers.tn', 'HEALTHCARE', 200, 1),
('01JCVMKC3EP2N3X4Y5Z6A7B8G3', 'Carrefour Tunisie', '567890EFG', 'La Marsa', 'Tunis', '+21671567890', 'rh@carrefour.tn', 'RETAIL', 1500, 1);

-- HR users for each company
-- Password hash is for 'Dhamen@2024!'
INSERT OR IGNORE INTO users (id, email, password_hash, role, company_id, first_name, last_name, phone, is_active) VALUES
('01JCVMKC4AP2N3X4Y5Z6A7B8C9', 'rh@tunisietelecom.tn', '$pbkdf2$100000$qpVIbyGwiladDZsfFG7rWg==$JLAJs+t8U6vWbHNYwKNxfArAUS46ufcAo+b6Yag7TI8=', 'HR', '01JCVMKC3AP2N3X4Y5Z6A7B8C9', 'Sami', 'Belhadj', '+21698111222', 1),
('01JCVMKC4BP2N3X4Y5Z6A7B8D0', 'rh@biat.com.tn', '$pbkdf2$100000$qpVIbyGwiladDZsfFG7rWg==$JLAJs+t8U6vWbHNYwKNxfArAUS46ufcAo+b6Yag7TI8=', 'HR', '01JCVMKC3BP2N3X4Y5Z6A7B8D0', 'Amina', 'Miled', '+21698222333', 1),
('01JCVMKC4CP2N3X4Y5Z6A7B8E1', 'rh@poulina.tn', '$pbkdf2$100000$qpVIbyGwiladDZsfFG7rWg==$JLAJs+t8U6vWbHNYwKNxfArAUS46ufcAo+b6Yag7TI8=', 'HR', '01JCVMKC3CP2N3X4Y5Z6A7B8E1', 'Karim', 'Nasri', '+21698333444', 1),
('01JCVMKC4DP2N3X4Y5Z6A7B8F2', 'rh@oliviers.tn', '$pbkdf2$100000$qpVIbyGwiladDZsfFG7rWg==$JLAJs+t8U6vWbHNYwKNxfArAUS46ufcAo+b6Yag7TI8=', 'HR', '01JCVMKC3DP2N3X4Y5Z6A7B8F2', 'Rania', 'Ksontini', '+21698444555', 1),
('01JCVMKC4EP2N3X4Y5Z6A7B8G3', 'rh@carrefour.tn', '$pbkdf2$100000$qpVIbyGwiladDZsfFG7rWg==$JLAJs+t8U6vWbHNYwKNxfArAUS46ufcAo+b6Yag7TI8=', 'HR', '01JCVMKC3EP2N3X4Y5Z6A7B8G3', 'Mehdi', 'Bouaziz', '+21698555666', 1);

-- Link some existing adherents to companies
UPDATE adherents SET company_id = '01JCVMKC3AP2N3X4Y5Z6A7B8C9', company_name = 'Tunisie Telecom' WHERE id IN (SELECT id FROM adherents LIMIT 4);
UPDATE adherents SET company_id = '01JCVMKC3BP2N3X4Y5Z6A7B8D0', company_name = 'BIAT' WHERE id IN (SELECT id FROM adherents LIMIT 4 OFFSET 4);
UPDATE adherents SET company_id = '01JCVMKC3CP2N3X4Y5Z6A7B8E1', company_name = 'Groupe Poulina' WHERE id IN (SELECT id FROM adherents LIMIT 4 OFFSET 8);
UPDATE adherents SET company_id = '01JCVMKC3DP2N3X4Y5Z6A7B8F2', company_name = 'Clinique les Oliviers' WHERE id IN (SELECT id FROM adherents LIMIT 4 OFFSET 12);
UPDATE adherents SET company_id = '01JCVMKC3EP2N3X4Y5Z6A7B8G3', company_name = 'Carrefour Tunisie' WHERE id IN (SELECT id FROM adherents LIMIT 4 OFFSET 16);
