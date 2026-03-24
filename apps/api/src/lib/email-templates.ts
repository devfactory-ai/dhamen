/**
 * Email HTML templates for authentication flows
 */

const BRAND_COLOR = '#0A1628';
const ACCENT_COLOR = '#2563EB';

function baseLayout(content: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:40px 20px;">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
<tr><td style="background:${BRAND_COLOR};padding:24px 32px;text-align:center;">
<span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:1px;">◆ DHAMEN</span>
</td></tr>
<tr><td style="padding:32px;">
${content}
</td></tr>
<tr><td style="padding:16px 32px;background:#f8f9fa;text-align:center;border-top:1px solid #e5e7eb;">
<p style="margin:0;font-size:11px;color:#9ca3af;">© ${new Date().getFullYear()} Dhamen. Tous droits réservés.</p>
<p style="margin:4px 0 0;font-size:11px;color:#9ca3af;">Gestionnaire d'assurance agréé.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export function renderMfaCodeEmail(code: string, userName: string): string {
  const digits = code.split('');
  const boxes = digits
    .map(
      (d) =>
        `<td style="width:44px;height:52px;background:#f1f5f9;border:2px solid #e2e8f0;border-radius:8px;text-align:center;font-size:24px;font-weight:700;color:${BRAND_COLOR};letter-spacing:2px;">${d}</td>`
    )
    .join('<td style="width:8px;"></td>');

  return baseLayout(`
<h2 style="margin:0 0 8px;font-size:20px;color:${BRAND_COLOR};text-align:center;">Vérification de sécurité</h2>
<p style="margin:0 0 24px;font-size:14px;color:#6b7280;text-align:center;">
  Bonjour ${userName}, voici votre code de vérification :
</p>
<table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
<tr>${boxes}</tr>
</table>
<p style="margin:0 0 8px;font-size:13px;color:#6b7280;text-align:center;">
  Ce code expire dans <strong>5 minutes</strong>.
</p>
<p style="margin:0;font-size:13px;color:#6b7280;text-align:center;">
  Si vous n'avez pas demandé ce code, ignorez cet email.
</p>
`);
}

export function renderMagicLinkEmail(loginUrl: string, userName: string): string {
  return baseLayout(`
<h2 style="margin:0 0 8px;font-size:20px;color:${BRAND_COLOR};text-align:center;">Connexion par lien magique</h2>
<p style="margin:0 0 24px;font-size:14px;color:#6b7280;text-align:center;">
  Bonjour ${userName}, cliquez sur le bouton ci-dessous pour vous connecter à votre espace Dhamen.
</p>
<table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
<tr><td>
<a href="${loginUrl}" style="display:inline-block;padding:12px 32px;background:${ACCENT_COLOR};color:#fff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">
  Se connecter
</a>
</td></tr>
</table>
<p style="margin:0 0 8px;font-size:13px;color:#6b7280;text-align:center;">
  Ce lien expire dans <strong>15 minutes</strong>.
</p>
<p style="margin:0;font-size:13px;color:#6b7280;text-align:center;">
  Si vous n'avez pas demandé ce lien, ignorez cet email.
</p>
`);
}

export function renderPasswordResetEmail(resetUrl: string, userName: string): string {
  return baseLayout(`
<h2 style="margin:0 0 8px;font-size:20px;color:${BRAND_COLOR};text-align:center;">Réinitialisation du mot de passe</h2>
<p style="margin:0 0 24px;font-size:14px;color:#6b7280;text-align:center;">
  Bonjour ${userName}, vous avez demandé la réinitialisation de votre mot de passe.
</p>
<table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
<tr><td>
<a href="${resetUrl}" style="display:inline-block;padding:12px 32px;background:${ACCENT_COLOR};color:#fff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">
  Réinitialiser mon mot de passe
</a>
</td></tr>
</table>
<p style="margin:0 0 8px;font-size:13px;color:#6b7280;text-align:center;">
  Ce lien expire dans <strong>30 minutes</strong>.
</p>
<p style="margin:0;font-size:13px;color:#6b7280;text-align:center;">
  Si vous n'avez pas fait cette demande, ignorez cet email.
</p>
`);
}
