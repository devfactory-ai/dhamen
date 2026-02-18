import { cors } from 'hono/cors';

/**
 * CORS middleware configuration
 */
export const corsMiddleware = cors({
  origin: (origin) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      return '*';
    }

    // In production, restrict to specific domains
    const allowedOrigins = [
      'http://localhost:5173', // Vite dev server
      'http://localhost:3000',
      'https://app.dhamen.tn',
      'https://staging.dhamen.tn',
    ];

    if (allowedOrigins.includes(origin)) {
      return origin;
    }

    // Allow all *.dhamen.tn subdomains
    if (origin.endsWith('.dhamen.tn')) {
      return origin;
    }

    return null;
  },
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  exposeHeaders: ['X-Request-ID', 'X-Total-Count'],
  maxAge: 86400,
  credentials: true,
});
