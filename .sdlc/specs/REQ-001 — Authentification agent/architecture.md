# Authentification agent

## Endpoint

POST /auth/login

## Request

{
 "email": "agent@assurance.tn",
 "password": "password"
}

## Response

{
 "token": "jwt"
}

## Database

Table agents

id
email
password_hash
created_at

## Security

- password hash avec bcrypt
- JWT signé
- middleware auth pour routes protégées