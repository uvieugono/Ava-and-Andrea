import nodemailer from 'nodemailer';
import { normalisePhone, type Notifiers } from './workflow.ts';
import { solyntaflowNotifiers } from './solyntaflow.ts';

/**
 * Real delivery for the contact form (email) and fee reminders (WhatsApp).
 * Each one is only returned when its credentials are set, so an unconfigured
 * feature reports "not configured" instead of pretending to send.
 *
 * Email:    SMTP_HOST, SMTP_PORT (587), SMTP_USER, SMTP_PASS, SMTP_FROM (defaults to SMTP_USER), CONTACT_TO
 * WhatsApp: WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TEMPLATE_NAME, WHATSAPP_TEMPLATE_LANG (en)
 */
export function defaultNotifiers(env: NodeJS.ProcessEnv = process.env): Notifiers {
  const notifiers: Notifiers = {};

  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS && env.CONTACT_TO) {
    const transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: Number(env.SMTP_PORT || 587),
      secure: Number(env.SMTP_PORT || 587) === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
    const to = env.CONTACT_TO;
    const from = env.SMTP_FROM || env.SMTP_USER;
    notifiers.mail = async ({ name, phone, message }) => {
      await transport.sendMail({
        from,
        to,
        subject: `GymTrack enquiry from ${name}`,
        text: `Name: ${name}\nTelephone: ${phone}\n\n${message}`,
      });
    };
  }

  if (env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID) {
    const endpoint = `https://graph.facebook.com/v20.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
    notifiers.whatsapp = async ({ to, gymnastName, clubName, message }) => {
      const template = env.WHATSAPP_TEMPLATE_NAME;
      const body = template
        ? {
            messaging_product: 'whatsapp',
            to: normalisePhone(to),
            type: 'template',
            template: {
              name: template,
              language: { code: env.WHATSAPP_TEMPLATE_LANG || 'en' },
              components: [
                {
                  type: 'body',
                  parameters: [
                    { type: 'text', text: gymnastName },
                    { type: 'text', text: clubName },
                    { type: 'text', text: message },
                  ],
                },
              ],
            },
          }
        : {
            // Free text only reaches people who messaged the number in the last 24 hours.
            messaging_product: 'whatsapp',
            to: normalisePhone(to),
            type: 'text',
            text: { body: `${clubName}: ${message}` },
          };
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { authorization: `Bearer ${env.WHATSAPP_TOKEN}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: { message?: string }; messages?: { id: string }[] };
      if (!response.ok) {
        return { status: 'failed', detail: payload.error?.message || `WhatsApp returned ${response.status}` };
      }
      return { status: 'sent', detail: payload.messages?.[0]?.id ?? 'accepted' };
    };
  }

  // GymTrack's own SolyntaFlow company takes over enquiries and WhatsApp when it is connected.
  const soly = solyntaflowNotifiers(env);
  if (soly) {
    notifiers.enquiry = soly.enquiry;
    notifiers.whatsapp = soly.whatsapp;
  }

  return notifiers;
}
