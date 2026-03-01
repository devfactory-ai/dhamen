-- Migration: Seed insurance agent user accounts
-- Description: Create user accounts for insurance agents (INSURER_AGENT role)
-- These agents are sub-contractors who process claims and validate care bulletins
-- Password hash is for 'Password123!' (same as other demo accounts)

-- ============================================
-- INSURANCE AGENT USER ACCOUNTS
-- ============================================

INSERT INTO users (id, email, password_hash, role, provider_id, insurer_id, first_name, last_name, phone, mfa_enabled, is_active) VALUES
-- Sami Khlifi - Agent STAR
('01JCVMKD1AP2N3X4Y5Z6A7B8A1', 'agent.star@email.tn', '$pbkdf2$100000$BIceZO/26w7s/paJT9lX9A==$YqH2q/wCnl17FQoKolIEvf57gEDQSOCDtZnAeV1NkPI=', 'INSURER_AGENT', NULL, '01JCVMK8R7P2N3X4Y5Z6A7B8C9', 'Sami', 'Khlifi', '+21698111001', 0, 1),

-- Ines Mejri - Agent GAT
('01JCVMKD1BP2N3X4Y5Z6A7B8B2', 'agent.gat@email.tn', '$pbkdf2$100000$BIceZO/26w7s/paJT9lX9A==$YqH2q/wCnl17FQoKolIEvf57gEDQSOCDtZnAeV1NkPI=', 'INSURER_AGENT', NULL, '01JCVMK8R7P2N3X4Y5Z6A7B8D0', 'Ines', 'Mejri', '+21698111002', 0, 1),

-- Karim Dridi - Agent COMAR
('01JCVMKD1CP2N3X4Y5Z6A7B8C3', 'agent.comar@email.tn', '$pbkdf2$100000$BIceZO/26w7s/paJT9lX9A==$YqH2q/wCnl17FQoKolIEvf57gEDQSOCDtZnAeV1NkPI=', 'INSURER_AGENT', NULL, '01JCVMK8R7P2N3X4Y5Z6A7B8E1', 'Karim', 'Dridi', '+21698111003', 0, 1);
