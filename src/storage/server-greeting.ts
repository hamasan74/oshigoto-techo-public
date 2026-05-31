export interface ServerTodayFact {
  title: string;
  detail: string;
  sourceLabel: string;
  sourceUrl: string;
}

interface ServerTodayFactResponse {
  ok: boolean;
  fact?: ServerTodayFact | null;
  error?: string;
}

const factRequestCache = new Map<string, Promise<ServerTodayFact | null>>();

async function parseFactResponse(response: Response) {
  const rawBody = await response.text();
  const payload = rawBody.trim()
    ? (JSON.parse(rawBody) as ServerTodayFactResponse)
    : ({ ok: false } satisfies ServerTodayFactResponse);

  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `Failed to load today fact (${response.status}).`);
  }

  return payload.fact ?? null;
}

export function loadServerTodayFact(date: string) {
  const cachedRequest = factRequestCache.get(date);
  if (cachedRequest) {
    return cachedRequest;
  }

  const request = fetch(`/api/greeting/today?date=${encodeURIComponent(date)}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  })
    .then(parseFactResponse)
    .catch((error) => {
      factRequestCache.delete(date);
      throw error;
    });

  factRequestCache.set(date, request);
  return request;
}
