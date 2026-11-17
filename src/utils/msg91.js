/**
 * MSG91 Flow SMS helper (India DLT / utility templates).
 * Sends via POST https://control.msg91.com/api/v5/flow/
 *
 * Env:
 *   MSG91_AUTH_KEY   — panel auth key
 *   MSG91_FLOW_ID    — approved template / flow id
 *   MSG91_SENDER_ID  — 6-char DLT sender (e.g. AHIMSA)
 */
import env from '../config/env.js';

const FLOW_URL = 'https://control.msg91.com/api/v5/flow/';

export function msg91Configured() {
  return Boolean(env.msg91?.authKey && env.msg91?.flowId && env.msg91?.senderId);
}

/** E.164 +91… → 9198… for MSG91 */
export function toMsg91Mobile(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
  return digits;
}

/**
 * Send intake acknowledgement SMS.
 * Template variables (MSG91 ##var##): name, patientno
 * DLT body must match exactly, e.g.:
 *   Dear {#var#}, your case sheet is registered at Ahimsa Wellness Centre, Gurugram. Patient No: {#var#}. Please show this at the front desk. - Ahimsa
 */
export async function sendIntakeAckSms({ phone, name, patientNo }) {
  if (!msg91Configured()) {
    return { skipped: true, reason: 'msg91_not_configured' };
  }

  const mobiles = toMsg91Mobile(phone);
  if (!mobiles || mobiles.length < 12) {
    return { skipped: true, reason: 'invalid_phone' };
  }

  const firstName = String(name || 'Guest').trim().split(/\s+/)[0].slice(0, 30);
  const body = {
    template_id: env.msg91.flowId,
    short_url: '0',
    recipients: [
      {
        mobiles,
        name: firstName,
        patientno: String(patientNo || '').slice(0, 32),
      },
    ],
  };

  // Flow API also accepts flow_id + sender; include both for compatibility.
  const payload = {
    ...body,
    flow_id: env.msg91.flowId,
    sender: env.msg91.senderId,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(FLOW_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authkey: env.msg91.authKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    if (!res.ok || data?.type === 'error') {
      console.error('MSG91 intake SMS failed:', res.status, data);
      return { ok: false, status: res.status, data };
    }
    return { ok: true, data };
  } catch (err) {
    console.error('MSG91 intake SMS error:', err.message);
    return { ok: false, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}
