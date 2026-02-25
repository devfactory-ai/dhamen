import { DurableObject } from 'cloudflare:workers';
import type { Bindings } from '../types';

interface RateLimitState {
  count: number;
  windowStart: number;
}

interface RateLimitRequest {
  maxRequests: number;
  windowSeconds: number;
}

interface RateLimitResponse {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

/**
 * Durable Object for distributed rate limiting
 * Provides consistent rate limiting across all Cloudflare edge locations
 */
export class RateLimiter extends DurableObject<Bindings> {
  /**
   * Check and increment rate limit counter
   * Uses sliding window algorithm for fair rate limiting
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/check') {
      return this.handleCheck(request);
    }

    if (url.pathname === '/reset') {
      return this.handleReset();
    }

    return new Response('Not Found', { status: 404 });
  }

  private async handleCheck(request: Request): Promise<Response> {
    const body = await request.json() as RateLimitRequest;
    const { maxRequests, windowSeconds } = body;

    const now = Math.floor(Date.now() / 1000);

    // Get current state from storage
    let state = await this.ctx.storage.get<RateLimitState>('state');

    // Initialize or reset if window expired
    if (!state || now - state.windowStart >= windowSeconds) {
      state = { count: 0, windowStart: now };
    }

    // Check if rate limit exceeded
    if (state.count >= maxRequests) {
      const retryAfter = windowSeconds - (now - state.windowStart);
      const response: RateLimitResponse = {
        allowed: false,
        remaining: 0,
        resetAt: state.windowStart + windowSeconds,
        retryAfter,
      };
      return Response.json(response);
    }

    // Increment counter
    state.count += 1;
    await this.ctx.storage.put('state', state);

    const response: RateLimitResponse = {
      allowed: true,
      remaining: maxRequests - state.count,
      resetAt: state.windowStart + windowSeconds,
    };

    return Response.json(response);
  }

  private async handleReset(): Promise<Response> {
    await this.ctx.storage.delete('state');
    return Response.json({ success: true });
  }
}
