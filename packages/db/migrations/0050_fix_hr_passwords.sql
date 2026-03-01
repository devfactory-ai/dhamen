-- Migration: Fix HR user passwords to use demo password
-- Password hash is for 'Password123!' (same as admin@dhamen.tn)

UPDATE users
SET password_hash = '$pbkdf2$100000$BIceZO/26w7s/paJT9lX9A==$YqH2q/wCnl17FQoKolIEvf57gEDQSOCDtZnAeV1NkPI='
WHERE role = 'HR';
