import type { MailSendPreview } from '../types/mail';

const localhostMailHelperOrigin = 'http://127.0.0.1:17873';
const localhostMailHelperClientHeader = 'localhost-outlook-helper';
const missingMailRecipientMessage =
  '宛先(To)が未設定です。ヘッダーの「利用者設定」でメール送信先を保存してください。';

function normalizeEmailList(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\r\n,;]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function encodeMailtoComponent(value: string) {
  return encodeURIComponent(value);
}

export function buildMailtoHref(preview: MailSendPreview) {
  const toList = normalizeEmailList(preview.to);
  const ccList = normalizeEmailList(preview.cc);

  if (toList.length === 0) {
    throw new Error(missingMailRecipientMessage);
  }

  const queryParts = [
    ccList.length > 0 ? `cc=${encodeMailtoComponent(ccList.join(','))}` : null,
    `subject=${encodeMailtoComponent(preview.subject)}`,
    `body=${encodeMailtoComponent(preview.textBody)}`,
  ].filter((value): value is string => Boolean(value));

  const toPath = toList.map((address) => encodeURIComponent(address)).join(',');
  return `mailto:${toPath}?${queryParts.join('&')}`;
}

export function openLocalMailCompose(preview: MailSendPreview) {
  const href = buildMailtoHref(preview);

  if (typeof window === 'undefined') {
    throw new Error('この環境ではメール作成画面を開けません。');
  }

  try {
    if (typeof window.open === 'function') {
      window.open(href, '_self');
    } else {
      window.location.href = href;
    }
  } catch (error) {
    throw new Error(
      error instanceof Error ? `メール作成画面を開けませんでした。${error.message}` : 'メール作成画面を開けませんでした。',
    );
  }

  return {
    href,
  };
}

export async function openPreferredMailCompose(preview: MailSendPreview) {
  const toList = normalizeEmailList(preview.to);
  if (toList.length === 0) {
    throw new Error(missingMailRecipientMessage);
  }

  if (typeof window === 'undefined') {
    throw new Error('この環境ではメール作成画面を開けません。');
  }

  const localhostComposeResult = await tryOpenLocalhostHtmlHelperCompose(preview);
  if (localhostComposeResult) {
    return localhostComposeResult;
  }

  return openLocalMailCompose(preview);
}

async function fetchJsonWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    const rawBody = await response.text();
    let payload: Record<string, unknown> | null = null;

    if (rawBody.trim()) {
      try {
        payload = JSON.parse(rawBody) as Record<string, unknown>;
      } catch {
        payload = null;
      }
    }

    return {
      response,
      payload,
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function isLocalhostMailHelperOriginAllowed(origin: string) {
  return /^(http:\/\/)(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$/i.test(
    origin,
  );
}

async function tryOpenLocalhostHtmlHelperCompose(preview: MailSendPreview) {
  if (typeof window === 'undefined') {
    return null;
  }

  const pageOrigin = window.location.origin;
  if (!isLocalhostMailHelperOriginAllowed(pageOrigin)) {
    return null;
  }

  try {
    const healthResult = await fetchJsonWithTimeout(
      `${localhostMailHelperOrigin}/health`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-Oshigoto-Techo-Helper': localhostMailHelperClientHeader,
        },
        mode: 'cors',
        cache: 'no-store',
      },
      900,
    );

    if (!healthResult.response.ok || healthResult.payload?.ok !== true) {
      return null;
    }
  } catch {
    return null;
  }

  const composeResult = await fetchJsonWithTimeout(
    `${localhostMailHelperOrigin}/compose`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json; charset=utf-8',
        'X-Oshigoto-Techo-Helper': localhostMailHelperClientHeader,
      },
      mode: 'cors',
      cache: 'no-store',
      body: JSON.stringify({
        to: preview.to,
        cc: preview.cc,
        subject: preview.subject,
        htmlBody: preview.htmlBody,
        textBody: preview.textBody,
      }),
    },
    4000,
  );

  if (!composeResult.response.ok || composeResult.payload?.ok !== true) {
    if (typeof window !== 'undefined' && typeof window.console?.warn === 'function') {
      window.console.warn('localhost helper compose failed, falling back to another mail flow.', {
        status: composeResult.response.status,
        error: composeResult.payload?.error,
      });
    }
    return null;
  }

  return {
    mode: 'localhost-helper',
  };
}

async function createHtmlHelperPayloadUrl(preview: MailSendPreview) {
  const response = await fetch('/api/mail/helper-draft', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      to: preview.to,
      cc: preview.cc,
      subject: preview.subject,
      htmlBody: preview.htmlBody,
      textBody: preview.textBody,
    }),
  });

  let payload: { ok?: boolean; payloadUrl?: string; error?: string } | null = null;
  try {
    payload = (await response.json()) as { ok?: boolean; payloadUrl?: string; error?: string };
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.ok || !payload.payloadUrl) {
    throw new Error(payload?.error || 'HTMLメール連携用の下書きデータを準備できませんでした。');
  }

  return payload.payloadUrl;
}

function buildHtmlHelperHref(payloadUrl: string) {
  return `oshigoto-techo-mail://compose?payloadUrl=${encodeURIComponent(payloadUrl)}`;
}

export async function openHtmlHelperMailCompose(preview: MailSendPreview) {
  const toList = normalizeEmailList(preview.to);
  if (toList.length === 0) {
    throw new Error(missingMailRecipientMessage);
  }

  if (typeof window === 'undefined') {
    throw new Error('この環境ではメール作成画面を開けません。');
  }

  const localhostComposeResult = await tryOpenLocalhostHtmlHelperCompose(preview);
  if (localhostComposeResult) {
    return localhostComposeResult;
  }

  const payloadUrl = await createHtmlHelperPayloadUrl(preview);
  const href = buildHtmlHelperHref(payloadUrl);

  try {
    if (typeof window.open === 'function') {
      window.open(href, '_self');
    } else {
      window.location.href = href;
    }
  } catch (error) {
    throw new Error(
      error instanceof Error ? `HTMLメール連携を開けませんでした。${error.message}` : 'HTMLメール連携を開けませんでした。',
    );
  }

  return {
    href,
    payloadUrl,
    mode: 'custom-protocol',
  };
}
