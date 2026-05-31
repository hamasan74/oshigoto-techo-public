import { defaultCurrentUserId, normalizeCurrentUserId } from '../storage/current-user-storage';
import type { MailRecipientSettings } from '../types/mail';

const demoMailRecipientSettings: MailRecipientSettings = {
  to: 'unot@nttdata-bizsys.co.jp',
  cc: [
    'akatsukam@nttdata-bizsys.co.jp',
    'asahit@nttdata-bizsys.co.jp',
    'hasadas@nttdata-bizsys.co.jp',
    'okudas@nttdata-bizsys.co.jp',
    'satoasumi@nttdata-bizsys.co.jp',
    'kuzuokan@nttdata-bizsys.co.jp',
  ].join('; '),
};

function normalizeEmailList(value: string | null | undefined) {
  return Array.from(
    new Set(
      (value ?? '')
        .split(/[\r\n,;]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).join('; ');
}

export function normalizeMailRecipientSettings(settings: Partial<MailRecipientSettings> | null | undefined) {
  return {
    to: normalizeEmailList(settings?.to),
    cc: normalizeEmailList(settings?.cc),
  } satisfies MailRecipientSettings;
}

export function getDefaultMailRecipientSettings(userId: string | null | undefined) {
  if (normalizeCurrentUserId(userId) === defaultCurrentUserId) {
    return demoMailRecipientSettings;
  }

  return {
    to: '',
    cc: '',
  } satisfies MailRecipientSettings;
}
