import { describe, it, expect } from 'vitest';
import { success, error, unauthorized, forbidden, notFound, paginated } from '../lib/response';
import { Hono } from 'hono';

describe('Response Helpers', () => {
  describe('success', () => {
    it('should return success response with data', async () => {
      const app = new Hono();
      app.get('/test', (c) => success(c, { foo: 'bar' }));

      const res = await app.request('/test');
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toEqual({ foo: 'bar' });
    });

    it('should allow custom status code', async () => {
      const app = new Hono();
      app.post('/test', (c) => success(c, { created: true }, 201));

      const res = await app.request('/test', { method: 'POST' });

      expect(res.status).toBe(201);
    });
  });

  describe('error', () => {
    it('should return error response', async () => {
      const app = new Hono();
      app.get('/test', (c) => error(c, 'TEST_ERROR', 'Test message', 400));

      const res = await app.request('/test');
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('TEST_ERROR');
      expect(body.error.message).toBe('Test message');
    });
  });

  describe('unauthorized', () => {
    it('should return 401 response', async () => {
      const app = new Hono();
      app.get('/test', (c) => unauthorized(c));

      const res = await app.request('/test');
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should allow custom message', async () => {
      const app = new Hono();
      app.get('/test', (c) => unauthorized(c, 'Custom message'));

      const res = await app.request('/test');
      const body = await res.json();

      expect(body.error.message).toBe('Custom message');
    });
  });

  describe('forbidden', () => {
    it('should return 403 response', async () => {
      const app = new Hono();
      app.get('/test', (c) => forbidden(c));

      const res = await app.request('/test');
      const body = await res.json();

      expect(res.status).toBe(403);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('notFound', () => {
    it('should return 404 response', async () => {
      const app = new Hono();
      app.get('/test', (c) => notFound(c, 'Utilisateur non trouvé'));

      const res = await app.request('/test');
      const body = await res.json();

      expect(res.status).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toBe('Utilisateur non trouvé');
    });
  });

  describe('paginated', () => {
    it('should return paginated response', async () => {
      const app = new Hono();
      app.get('/test', (c) =>
        paginated(c, [{ id: 1 }, { id: 2 }], { page: 1, limit: 10, total: 25 })
      );

      const res = await app.request('/test');
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
      expect(body.meta.page).toBe(1);
      expect(body.meta.limit).toBe(10);
      expect(body.meta.total).toBe(25);
      expect(body.meta.totalPages).toBe(3);
    });
  });
});
