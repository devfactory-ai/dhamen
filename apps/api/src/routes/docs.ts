/**
 * API Documentation Routes
 *
 * OpenAPI specification and Swagger UI
 */

import { Hono } from 'hono';
import type { Bindings, Variables } from '../types';

const docs = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * OpenAPI 3.0 Specification
 */
const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Dhamen API',
    description: 'Plateforme IA-native de tiers payant santé pour la Tunisie',
    version: '1.0.0',
    contact: {
      name: 'Dhamen Support',
      email: 'support@dhamen.tn',
      url: 'https://dhamen.tn',
    },
    license: {
      name: 'Proprietary',
    },
  },
  servers: [
    {
      url: 'https://dhamen-api.yassine-techini.workers.dev/api/v1',
      description: 'Production',
    },
    {
      url: 'https://dhamen-api-staging.yassine-techini.workers.dev/api/v1',
      description: 'Staging',
    },
  ],
  tags: [
    { name: 'Auth', description: 'Authentication and authorization' },
    { name: 'Adherents', description: 'Adherent management' },
    { name: 'Claims', description: 'Claims processing' },
    { name: 'SoinFlow', description: 'SoinFlow health claims management' },
    { name: 'Eligibility', description: 'Eligibility verification' },
    { name: 'Bordereaux', description: 'Bordereaux management' },
    { name: 'Providers', description: 'Healthcare provider management' },
    { name: 'Contracts', description: 'Contract management' },
    { name: 'Payments', description: 'Payment processing' },
    { name: 'SMS', description: 'SMS Gateway and OTP' },
    { name: 'Cards', description: 'Virtual adherent cards' },
    { name: 'OCR', description: 'Document OCR processing' },
    { name: 'Exports', description: 'PDF and Excel exports' },
    { name: 'Monitoring', description: 'Health checks and metrics' },
  ],
  paths: {
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'User login',
        description: 'Authenticate user and receive JWT tokens',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email', example: 'user@example.com' },
                  password: { type: 'string', minLength: 8, example: 'SecurePass123!' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Login successful',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/LoginResponse',
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Refresh token',
        description: 'Get new access token using refresh token',
        security: [{ cookieAuth: [] }],
        responses: {
          '200': { description: 'Token refreshed' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'User logout',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Logged out successfully' },
        },
      },
    },
    '/eligibility/check': {
      post: {
        tags: ['Eligibility'],
        summary: 'Check adherent eligibility',
        description: 'Verify if an adherent is eligible for a specific care type',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['adherentId', 'careType'],
                properties: {
                  adherentId: { type: 'string', format: 'uuid' },
                  adherentNumber: { type: 'string' },
                  cin: { type: 'string' },
                  careType: {
                    type: 'string',
                    enum: ['consultation', 'pharmacy', 'lab', 'imaging', 'hospitalization', 'dental', 'optical'],
                  },
                  amount: { type: 'number', description: 'Estimated amount in millimes' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Eligibility result',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/EligibilityResponse' },
              },
            },
          },
        },
      },
    },
    '/claims': {
      get: {
        tags: ['Claims'],
        summary: 'List claims',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['pending', 'approved', 'rejected', 'processing'] } },
          { name: 'adherentId', in: 'query', schema: { type: 'string' } },
          { name: 'providerId', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'Claims list',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ClaimsList' },
              },
            },
          },
        },
      },
      post: {
        tags: ['Claims'],
        summary: 'Create a new claim',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateClaim' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Claim created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Claim' },
              },
            },
          },
        },
      },
    },
    '/claims/{id}': {
      get: {
        tags: ['Claims'],
        summary: 'Get claim details',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description: 'Claim details',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Claim' },
              },
            },
          },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/claims/{id}/approve': {
      post: {
        tags: ['Claims'],
        summary: 'Approve a claim',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  approvedAmount: { type: 'number' },
                  notes: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Claim approved' },
        },
      },
    },
    '/claims/{id}/reject': {
      post: {
        tags: ['Claims'],
        summary: 'Reject a claim',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['reason'],
                properties: {
                  reason: { type: 'string' },
                  notes: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Claim rejected' },
        },
      },
    },
    '/adherents': {
      get: {
        tags: ['Adherents'],
        summary: 'List adherents',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'insurerId', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Adherents list' },
        },
      },
    },
    '/bordereaux': {
      get: {
        tags: ['Bordereaux'],
        summary: 'List bordereaux',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Bordereaux list' },
        },
      },
      post: {
        tags: ['Bordereaux'],
        summary: 'Generate a bordereau',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['providerId', 'periodStart', 'periodEnd'],
                properties: {
                  providerId: { type: 'string', format: 'uuid' },
                  periodStart: { type: 'string', format: 'date' },
                  periodEnd: { type: 'string', format: 'date' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Bordereau generated' },
        },
      },
    },
    '/providers': {
      get: {
        tags: ['Providers'],
        summary: 'List healthcare providers',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'type', in: 'query', schema: { type: 'string', enum: ['pharmacy', 'clinic', 'hospital', 'lab', 'doctor'] } },
          { name: 'active', in: 'query', schema: { type: 'boolean' } },
        ],
        responses: {
          '200': { description: 'Providers list' },
        },
      },
    },
    '/monitoring/health/ready': {
      get: {
        tags: ['Monitoring'],
        summary: 'Readiness probe',
        description: 'Check if all dependencies are ready',
        responses: {
          '200': {
            description: 'Service is ready',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/HealthCheck' },
              },
            },
          },
          '503': { description: 'Service unavailable' },
        },
      },
    },
    '/monitoring/metrics': {
      get: {
        tags: ['Monitoring'],
        summary: 'Prometheus metrics',
        description: 'Get metrics in Prometheus format',
        responses: {
          '200': {
            description: 'Metrics in text format',
            content: {
              'text/plain': {
                schema: { type: 'string' },
              },
            },
          },
        },
      },
    },
    // SMS Routes
    '/sms/send': {
      post: {
        tags: ['SMS'],
        summary: 'Send SMS',
        description: 'Send a single SMS message',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['to', 'body'],
                properties: {
                  to: { type: 'string', example: '+21698765432' },
                  body: { type: 'string', maxLength: 640 },
                  templateCode: { type: 'string' },
                  variables: { type: 'object' },
                  priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'SMS sent' },
          '400': { description: 'Invalid phone number' },
          '429': { description: 'Rate limit exceeded' },
        },
      },
    },
    '/sms/otp/send': {
      post: {
        tags: ['SMS'],
        summary: 'Send OTP',
        description: 'Send a one-time password via SMS',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['to'],
                properties: {
                  to: { type: 'string', example: '+21698765432' },
                  purpose: { type: 'string', enum: ['login', 'reset', 'verify'], default: 'login' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'OTP sent' },
        },
      },
    },
    '/sms/otp/verify': {
      post: {
        tags: ['SMS'],
        summary: 'Verify OTP',
        description: 'Verify a one-time password',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['to', 'otp'],
                properties: {
                  to: { type: 'string' },
                  otp: { type: 'string', minLength: 6, maxLength: 6 },
                  purpose: { type: 'string', enum: ['login', 'reset', 'verify'] },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'OTP valid' },
          '400': { description: 'OTP invalid or expired' },
        },
      },
    },
    '/sms/templates': {
      get: {
        tags: ['SMS'],
        summary: 'List SMS templates',
        description: 'Get available SMS templates',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Templates list' },
        },
      },
    },
    // Virtual Cards
    '/cards': {
      get: {
        tags: ['Cards'],
        summary: 'List virtual cards',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Cards list' } },
      },
      post: {
        tags: ['Cards'],
        summary: 'Create virtual card',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['adherentId'],
                properties: {
                  adherentId: { type: 'string' },
                  type: { type: 'string', enum: ['standard', 'premium'] },
                },
              },
            },
          },
        },
        responses: { '201': { description: 'Card created' } },
      },
    },
    '/cards/{id}/qr': {
      get: {
        tags: ['Cards'],
        summary: 'Get card QR code',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'QR code data',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    qrData: { type: 'string' },
                    expiresAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
      },
    },
    // SoinFlow Routes
    '/sante/demandes': {
      get: {
        tags: ['SoinFlow'],
        summary: 'List health claims',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
          { name: 'statut', in: 'query', schema: { type: 'string' } },
          { name: 'typeSoin', in: 'query', schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Claims list' } },
      },
      post: {
        tags: ['SoinFlow'],
        summary: 'Submit health claim',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['adherentId', 'typeSoin', 'montantDemande'],
                properties: {
                  adherentId: { type: 'string' },
                  typeSoin: { type: 'string', enum: ['consultation', 'pharmacie', 'analyse', 'hospitalisation', 'dentaire', 'optique'] },
                  montantDemande: { type: 'number', description: 'Amount in millimes' },
                  praticienId: { type: 'string' },
                  dateSoin: { type: 'string', format: 'date' },
                  documents: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
        responses: { '201': { description: 'Claim submitted' } },
      },
    },
    '/sante/profil': {
      get: {
        tags: ['SoinFlow'],
        summary: 'Get adherent health profile',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Health profile with coverage',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    adherent: { type: 'object' },
                    formule: { type: 'object' },
                    plafonds: { type: 'array' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/sante/profil/guarantees': {
      get: {
        tags: ['SoinFlow'],
        summary: 'Get detailed guarantees',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Guarantees details' } },
      },
    },
    '/sante/profil/reimbursements': {
      get: {
        tags: ['SoinFlow'],
        summary: 'Get reimbursement history',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
        ],
        responses: { '200': { description: 'Reimbursement history' } },
      },
    },
    // OCR Routes
    '/ocr/analyze': {
      post: {
        tags: ['OCR'],
        summary: 'Analyze document',
        description: 'Extract data from medical documents using AI OCR',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  file: { type: 'string', format: 'binary' },
                  documentType: { type: 'string', enum: ['bulletin', 'ordonnance', 'facture'] },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Extracted data',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    confidence: { type: 'number' },
                    extractedData: { type: 'object' },
                  },
                },
              },
            },
          },
        },
      },
    },
    // Export Routes
    '/exports/pdf': {
      post: {
        tags: ['Exports'],
        summary: 'Generate PDF',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['type', 'data'],
                properties: {
                  type: { type: 'string', enum: ['report', 'bordereau', 'facture', 'attestation', 'releve'] },
                  data: { type: 'object' },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'PDF generated' } },
      },
    },
    '/sante/exports/demandes': {
      get: {
        tags: ['Exports'],
        summary: 'Export claims list',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'format', in: 'query', schema: { type: 'string', enum: ['pdf', 'csv'] } },
          { name: 'dateFrom', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'dateTo', in: 'query', schema: { type: 'string', format: 'date' } },
        ],
        responses: { '200': { description: 'Export file' } },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'refresh_token',
      },
      apiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
      },
    },
    schemas: {
      LoginResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              user: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  email: { type: 'string' },
                  fullName: { type: 'string' },
                  role: { type: 'string' },
                },
              },
              mfaRequired: { type: 'boolean' },
            },
          },
        },
      },
      EligibilityResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              eligible: { type: 'boolean' },
              reason: { type: 'string' },
              coverage: {
                type: 'object',
                properties: {
                  careType: { type: 'string' },
                  coveragePercent: { type: 'number' },
                  maxAmount: { type: 'number' },
                  remainingLimit: { type: 'number' },
                },
              },
            },
          },
        },
      },
      Claim: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          reference: { type: 'string' },
          adherentId: { type: 'string' },
          providerId: { type: 'string' },
          careType: { type: 'string' },
          amount: { type: 'number' },
          approvedAmount: { type: 'number' },
          status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'processing'] },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      CreateClaim: {
        type: 'object',
        required: ['adherentId', 'careType', 'amount'],
        properties: {
          adherentId: { type: 'string', format: 'uuid' },
          careType: { type: 'string' },
          amount: { type: 'number', description: 'Amount in millimes' },
          description: { type: 'string' },
          documents: {
            type: 'array',
            items: { type: 'string', format: 'uri' },
          },
        },
      },
      ClaimsList: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'array',
            items: { $ref: '#/components/schemas/Claim' },
          },
          meta: { $ref: '#/components/schemas/Pagination' },
        },
      },
      Pagination: {
        type: 'object',
        properties: {
          page: { type: 'integer' },
          limit: { type: 'integer' },
          total: { type: 'integer' },
          totalPages: { type: 'integer' },
        },
      },
      HealthCheck: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
          checks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                status: { type: 'string' },
                latencyMs: { type: 'number' },
              },
            },
          },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              details: { type: 'object' },
            },
          },
        },
      },
    },
    responses: {
      Unauthorized: {
        description: 'Unauthorized',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
            example: {
              success: false,
              error: { code: 'UNAUTHORIZED', message: 'Authentification requise' },
            },
          },
        },
      },
      NotFound: {
        description: 'Resource not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
          },
        },
      },
      ValidationError: {
        description: 'Validation error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
          },
        },
      },
    },
  },
};

/**
 * GET /openapi.json
 * OpenAPI specification
 */
docs.get('/openapi.json', (c) => {
  return c.json(openApiSpec);
});

/**
 * GET /openapi.yaml
 * OpenAPI specification in YAML
 */
docs.get('/openapi.yaml', (c) => {
  // Simple YAML conversion
  const yaml = JSON.stringify(openApiSpec, null, 2)
    .replace(/"/g, '')
    .replace(/,$/gm, '');
  return new Response(yaml, {
    headers: { 'Content-Type': 'text/yaml' },
  });
});

/**
 * GET /
 * Swagger UI HTML
 */
docs.get('/', (c) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dhamen API Documentation</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.10.3/swagger-ui.css" />
  <style>
    body { margin: 0; padding: 0; }
    .swagger-ui .topbar { display: none; }
    .swagger-ui .info .title { font-size: 2rem; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.10.3/swagger-ui-bundle.js"></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: '/docs/openapi.json',
        dom_id: '#swagger-ui',
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIBundle.SwaggerUIStandalonePreset
        ],
        layout: "BaseLayout",
        deepLinking: true,
        showExtensions: true,
        showCommonExtensions: true,
        tryItOutEnabled: true,
      });
    };
  </script>
</body>
</html>`;

  return c.html(html);
});

/**
 * GET /redoc
 * ReDoc documentation
 */
docs.get('/redoc', (c) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dhamen API Documentation - ReDoc</title>
  <link href="https://fonts.googleapis.com/css?family=Montserrat:300,400,700|Roboto:300,400,700" rel="stylesheet">
  <style>body { margin: 0; padding: 0; }</style>
</head>
<body>
  <redoc spec-url='/docs/openapi.json'></redoc>
  <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
</body>
</html>`;

  return c.html(html);
});

export { docs };
