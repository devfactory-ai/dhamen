import { Hono } from 'hono';
import { z } from 'zod';
import type { Bindings, Variables } from '../types';

const contactSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  company: z.string().min(1).max(200),
  message: z.string().min(1).max(5000),
});

function buildContactEmailHtml(name: string, email: string, company: string, message: string): string {
  const date = new Date().toLocaleDateString('fr-TN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const escapedMessage = message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#0f766e 0%,#0d9488 50%,#14b8a6 100%);padding:32px 40px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-0.5px;">E-Santé</h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Plateforme de tiers payant santé</p>
          </td>
        </tr>
        <!-- Badge -->
        <tr>
          <td style="padding:32px 40px 0;">
            <table cellpadding="0" cellspacing="0"><tr>
              <td style="background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:20px;padding:6px 16px;">
                <span style="color:#15803d;font-size:12px;font-weight:600;">Nouveau message de contact</span>
              </td>
            </tr></table>
            <p style="margin:12px 0 0;color:#94a3b8;font-size:13px;">${date}</p>
          </td>
        </tr>
        <!-- Info cards -->
        <tr>
          <td style="padding:24px 40px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;">
              <tr>
                <td style="padding:20px 24px;border-bottom:1px solid #e2e8f0;">
                  <p style="margin:0 0 4px;color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Nom complet</p>
                  <p style="margin:0;color:#1e293b;font-size:16px;font-weight:600;">${name}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:20px 24px;border-bottom:1px solid #e2e8f0;">
                  <p style="margin:0 0 4px;color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Email</p>
                  <a href="mailto:${email}" style="color:#0f766e;font-size:16px;font-weight:600;text-decoration:none;">${email}</a>
                </td>
              </tr>
              <tr>
                <td style="padding:20px 24px;">
                  <p style="margin:0 0 4px;color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Entreprise / Organisation</p>
                  <p style="margin:0;color:#1e293b;font-size:16px;font-weight:600;">${company}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Message -->
        <tr>
          <td style="padding:0 40px 32px;">
            <p style="margin:0 0 12px;color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Message</p>
            <div style="background-color:#f8fafc;border-left:4px solid #14b8a6;border-radius:0 12px 12px 0;padding:20px 24px;">
              <p style="margin:0;color:#334155;font-size:15px;line-height:1.7;">${escapedMessage}</p>
            </div>
          </td>
        </tr>
        <!-- CTA -->
        <tr>
          <td style="padding:0 40px 32px;text-align:center;">
            <a href="mailto:${email}?subject=Re: Votre demande sur E-Santé" style="display:inline-block;background-color:#0f766e;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:14px;font-weight:600;">Répondre à ${name}</a>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background-color:#f8fafc;border-top:1px solid #e2e8f0;padding:24px 40px;text-align:center;">
            <p style="margin:0 0 4px;color:#94a3b8;font-size:12px;">E-Santé — Plateforme IA-native de tiers payant santé</p>
            <p style="margin:0;color:#cbd5e1;font-size:11px;">Tunisie | contact@e-sante.com.tn</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export const contact = new Hono<{ Bindings: Bindings; Variables: Variables }>();

contact.post('/', async (c) => {
  const body = await c.req.json();
  const parsed = contactSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Validation error' } },
      400
    );
  }

  const { name, email, company, message } = parsed.data;
  const brevoKey = c.env.BREVO_API_KEY;

  if (!brevoKey) {
    return c.json(
      { success: false, error: { code: 'CONFIG_ERROR', message: 'Service email non configuré' } },
      500
    );
  }

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'content-type': 'application/json',
      'api-key': brevoKey,
    },
    body: JSON.stringify({
      sender: { name: 'E-Santé Contact', email: 'noreply@e-sante.com.tn' },
      to: [{ email: 'contact@e-sante.com.tn', name: 'E-Santé' }],
      replyTo: { email, name },
      subject: `[E-Santé] Nouveau contact: ${name} — ${company}`,
      htmlContent: buildContactEmailHtml(name, email, company, message),
    }),
  });

  if (!res.ok) {
    return c.json(
      { success: false, error: { code: 'EMAIL_ERROR', message: "Erreur lors de l'envoi de l'email" } },
      502
    );
  }

  return c.json({ success: true, data: { sent: true } });
});
