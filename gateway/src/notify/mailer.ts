import nodemailer, { Transporter } from "nodemailer";
import { config } from "../config";
import { logger } from "../logger";

let transporter: Transporter | null = null;

/** Whether outbound email is both switched on and minimally configured. */
export function mailReady(): boolean {
  return config.mailEnabled && Boolean(config.smtpHost);
}

function getTransporter(): Transporter | null {
  if (!mailReady()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: config.smtpUser ? { user: config.smtpUser, pass: config.smtpPass } : undefined
    });
  }
  return transporter;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Send an email. Best-effort: when mail is disabled/unconfigured we only log so
 * that provisioning and other flows never fail because of notification setup.
 */
export async function sendMail(msg: MailMessage): Promise<boolean> {
  const tx = getTransporter();
  if (!tx) {
    logger.info(`[mail:disabled] -> ${msg.to} | ${msg.subject}`);
    return false;
  }
  try {
    await tx.sendMail({
      from: config.mailFrom,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html
    });
    logger.info(`[mail] sent -> ${msg.to} | ${msg.subject}`);
    return true;
  } catch (err) {
    logger.warn(`[mail] failed -> ${msg.to} | ${msg.subject}: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}
