# Authentification agent

## Endpoint

POST /api/v1/auth/login

## Request

```json
{
  "email": "agent@assurance.tn",
  "password": "SecureP@ss123!"
}
```

## Response (success)

```json
{
  "success": true,
  "data": {
    "requiresMfa": false,
    "expiresIn": 900,
    "user": {
      "id": "01HXYZ...",
      "email": "agent@assurance.tn",
      "role": "INSURER_AGENT",
      "insurerId": "insurer-001",
      "firstName": "Ahmed",
      "lastName": "Ben Salah"
    },
    "tokens": {
      "accessToken": "<jwt>",
      "refreshToken": "<jwt>"
    }
  }
}
```

## Response (error 401)

```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Email ou mot de passe incorrect"
  }
}
```

## Database

Table `users` (unified RBAC — no separate `agents` table)

| Column        | Type    | Notes                              |
|---------------|---------|------------------------------------|
| id            | TEXT    | ULID, primary key                  |
| email         | TEXT    | UNIQUE, lowercase                  |
| password_hash | TEXT    | PBKDF2 format                      |
| role          | TEXT    | `INSURER_AGENT` for agents         |
| insurer_id    | TEXT    | FK to insurers, identifies tenant  |
| first_name    | TEXT    |                                    |
| last_name     | TEXT    |                                    |
| is_active     | INTEGER | 1 = active, 0 = disabled           |
| mfa_enabled   | INTEGER |                                     |
| mfa_secret    | TEXT    | TOTP secret if MFA enabled         |
| created_at    | TEXT    | ISO 8601 UTC                       |
| updated_at    | TEXT    | ISO 8601 UTC                       |

## Security

- Password hash with PBKDF2 (Web Crypto API, 100k iterations) — not bcrypt (incompatible with Workers)
- JWT signed with HMAC-SHA256 via Web Crypto API
- Tokens set as HttpOnly cookies + returned in body (cross-origin fallback)
- Refresh token stored in KV with TTL
- Auth middleware on all protected routes (Bearer header or cookie)
- MFA support (TOTP) for elevated roles
- Audit trail on every login event

## Existing implementation files

- `apps/api/src/routes/auth.ts` — login, refresh, logout, MFA endpoints
- `apps/api/src/middleware/auth.ts` — authMiddleware, requireRole, requireAuth
- `apps/api/src/lib/jwt.ts` — signJWT, verifyJWT, signRefreshToken, verifyRefreshToken
- `apps/api/src/lib/password.ts` — hashPassword, verifyPassword (PBKDF2)
- `packages/shared/src/schemas/user.ts` — loginRequestSchema, Zod validation
- `packages/shared/src/types/user.ts` — User, JWTPayload, LoginRequest, LoginResponse types
- `packages/db/src/queries/users.ts` — findUserByEmail, createUser, updateUser
