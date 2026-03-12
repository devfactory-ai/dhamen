# Domain Context

This project implements a health insurance reimbursement platform.

The system manages:

- companies
- adherents (insured members)
- beneficiaries (family members)
- medical acts
- care claim forms (bulletins de soins)
- reimbursement calculations
- annual plafonds

The core workflow is:

Company
→ Adherents
→ Beneficiaries
→ Care claim (bulletin)
→ Medical acts
→ Reimbursement calculation
→ Plafond verification
→ Payment

All specifications inside `.sdlc/specs` must follow this domain model.