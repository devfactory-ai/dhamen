import { Hono } from 'hono';
import { z } from 'zod';
import type { Bindings, Variables } from '../types';

const contactSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
  orgType: z.string().min(1).max(100),
  message: z.string().min(1).max(5000),
});

export const contact = new Hono<{ Bindings: Bindings; Variables: Variables }>();

contact.post('/', async (c) => {
  const body = await c.req.json();
  const parsed = contactSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } },
      400
    );
  }

  const { firstName, lastName, email, orgType, message } = parsed.data;
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
      sender: { name: 'E-Santé Contact', email: 'contact@e-sante.com.tn' },
      to: [{ email: 's.sirine@devfactory.ai', name: 'E-Santé' }],
      replyTo: { email, name: `${firstName} ${lastName}` },
      subject: `[E-Santé Landing] Nouveau contact de ${firstName} ${lastName} (${orgType})`,
      htmlContent:
        '<h3>Nouveau message depuis le site E-Santé</h3>' +
        `<p><strong>Nom:</strong> ${firstName} ${lastName}</p>` +
        `<p><strong>Email:</strong> ${email}</p>` +
        `<p><strong>Organisation:</strong> ${orgType}</p>` +
        `<p><strong>Message:</strong></p><p>${message.replace(/\n/g, '<br>')}</p>`,
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
