---
id: TASK-003
title: Add retry with backoff to api-client upload method
status: done
priority: should
requires: []
ref: ADR-008
---

# TASK-003 — Add retry with backoff to api-client upload method

## Objective

Add automatic retry with exponential backoff to the `upload()` method in the mobile API client for network error resilience.

## Why

F-014 requires automatic retry on upload failure (max 3 attempts). The current `upload()` method fails immediately on network errors with no retry logic.

## Files to modify

| File | Change |
|------|--------|
| `apps/mobile/src/lib/api-client.ts` | Add retry wrapper to `upload()` method |

## Implementation details

Update the `upload()` method in the `ApiClient` class:

```typescript
async upload<T>(
  endpoint: string,
  formData: FormData,
  options?: { maxRetries?: number; onRetry?: (attempt: number) => void }
): Promise<ApiResponse<T>> {
  const maxRetries = options?.maxRetries ?? 3;
  let lastError: ApiResponse<T> | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.pow(2, attempt - 1) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
      options?.onRetry?.(attempt);
    }

    const result = await this._doUpload<T>(endpoint, formData);

    // Don't retry on non-network errors (auth, validation, server errors with response)
    if (result.success) return result;

    const code = result.error?.code;
    const isRetryable = code === 'NETWORK_ERROR' || code === 'TIMEOUT';
    if (!isRetryable) return result;

    lastError = result;
  }

  return lastError!;
}

private async _doUpload<T>(endpoint: string, formData: FormData): Promise<ApiResponse<T>> {
  // Move existing upload() body here (unchanged)
}
```

Key behaviors:
- Only retry on `NETWORK_ERROR` or `TIMEOUT` error codes
- Do NOT retry on `SESSION_EXPIRED`, `UPLOAD_ERROR` (400/422), or other server errors
- Exponential backoff: 1s, 2s, 4s delays
- Optional `onRetry` callback for UI progress updates
- `maxRetries` defaults to 3 but is configurable

## Tests

Manual testing on device:
- Enable airplane mode mid-upload → verify retry after reconnection
- Simulate slow network → verify timeout + retry succeeds on faster attempt

## Acceptance criteria

- [ ] Upload retries up to 3 times on network errors
- [ ] Backoff delays are 1s, 2s, 4s
- [ ] Non-network errors (auth, validation) are NOT retried
- [ ] `onRetry` callback fires on each retry attempt
- [ ] Existing upload behavior unchanged for successful requests
