/**
 * Cloudflare Turnstile verification
 *
 * Verifies the client-side Turnstile token against the Cloudflare API.
 * Returns true in development if no secret key is configured.
 */
export async function verifyTurnstile(
  token: string,
  secretKey: string | undefined,
  ip?: string
): Promise<boolean> {
  if (!secretKey) {
    // Skip in development when not configured
    return true;
  }

  const formData = new URLSearchParams();
  formData.append('secret', secretKey);
  formData.append('response', token);
  if (ip) formData.append('remoteip', ip);

  const response = await fetch(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    }
  );

  if (!response.ok) return false;

  const result = await response.json<{ success: boolean }>();
  return result.success;
}
