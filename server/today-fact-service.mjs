const wikipediaActionApiUrl = 'https://ja.wikipedia.org/w/api.php';
const wikipediaPageBaseUrl = 'https://ja.wikipedia.org/wiki/';
const todayFactCache = new Map();

const FACT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function buildWikipediaPageTitle(date) {
  if (!isIsoDate(date)) {
    throw new Error('date is required in YYYY-MM-DD format.');
  }

  const [, , monthValue, dayValue] = date.match(/^(\d{4})-(\d{2})-(\d{2})$/) ?? [];
  const month = Number(monthValue);
  const day = Number(dayValue);

  if (!Number.isInteger(month) || !Number.isInteger(day)) {
    throw new Error('Invalid date.');
  }

  return `${month}月${day}日`;
}

function buildWikipediaPageUrl(pageTitle) {
  return `${wikipediaPageBaseUrl}${encodeURIComponent(pageTitle)}`;
}

async function fetchWikipediaJson(params) {
  const url = new URL(wikipediaActionApiUrl);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');
  url.searchParams.set('origin', '*');

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'oshigoto-techo/1.0 (+local-app)',
    },
  });

  if (!response.ok) {
    throw new Error(`Wikipedia request failed: ${response.status}`);
  }

  const payload = await response.json();
  if (payload?.error?.info) {
    throw new Error(payload.error.info);
  }

  return payload;
}

async function fetchWikipediaSections(pageTitle) {
  const payload = await fetchWikipediaJson({
    action: 'parse',
    page: pageTitle,
    prop: 'sections',
  });
  return Array.isArray(payload?.parse?.sections) ? payload.parse.sections : [];
}

async function fetchWikipediaSectionHtml(pageTitle, sectionIndex) {
  const payload = await fetchWikipediaJson({
    action: 'parse',
    page: pageTitle,
    prop: 'text',
    section: sectionIndex,
  });
  return typeof payload?.parse?.text === 'string' ? payload.parse.text : '';
}

function resolveFactSection(sections) {
  const candidates = [
    {
      pattern: /記念日・年中行事|記念日/u,
      sourceLabel: 'Wikipedia 記念日・年中行事',
    },
    {
      pattern: /できごと/u,
      sourceLabel: 'Wikipedia できごと',
    },
  ];

  for (const candidate of candidates) {
    const section = sections.find((item) => candidate.pattern.test(item?.line ?? ''));
    if (section?.index != null) {
      return {
        index: section.index,
        sourceLabel: candidate.sourceLabel,
      };
    }
  }

  return null;
}

function extractTopLevelListItems(html, limit = 6) {
  const items = [];
  const firstListMatch = /<(ul|ol)\b[^>]*>/i.exec(html);
  if (!firstListMatch || firstListMatch.index == null) {
    return items;
  }

  const tagPattern = /<\/?(ul|ol|li)\b[^>]*>/gi;
  tagPattern.lastIndex = firstListMatch.index;

  let listDepth = 0;
  let itemDepth = 0;
  let captureStart = -1;
  let match;

  while ((match = tagPattern.exec(html))) {
    const [rawTag, tagName] = match;
    const isClosing = rawTag.startsWith('</');

    if (!isClosing) {
      if (tagName === 'ul' || tagName === 'ol') {
        listDepth += 1;
        continue;
      }

      if (tagName === 'li' && listDepth >= 1) {
        if (itemDepth === 0 && listDepth === 1) {
          captureStart = tagPattern.lastIndex;
        }
        itemDepth += 1;
      }
      continue;
    }

    if (tagName === 'li' && itemDepth > 0) {
      itemDepth -= 1;
      if (itemDepth === 0 && captureStart !== -1 && listDepth === 1) {
        items.push(html.slice(captureStart, match.index));
        captureStart = -1;
        if (items.length >= limit) {
          break;
        }
      }
      continue;
    }

    if (tagName === 'ul' || tagName === 'ol') {
      listDepth = Math.max(0, listDepth - 1);
      if (listDepth === 0 && items.length > 0) {
        break;
      }
    }
  }

  return items;
}

function decodeHtmlEntities(text) {
  const namedEntities = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  };

  return text
    .replace(/&#(\d+);/g, (_, codePoint) => String.fromCodePoint(Number(codePoint)))
    .replace(/&#x([0-9a-f]+);/gi, (_, codePoint) => String.fromCodePoint(parseInt(codePoint, 16)))
    .replace(/&([a-z]+);/gi, (match, entity) => namedEntities[entity.toLowerCase()] ?? match);
}

function stripHtml(fragment) {
  return decodeHtmlEntities(
    fragment
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/gi, ' ')
      .replace(/<figure\b[^>]*>[\s\S]*?<\/figure>/gi, ' ')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/?(p|div|span|dl|dd|dt|ul|ol|li)\b[^>]*>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  )
    .replace(/\s+([（【「『])/gu, '$1')
    .replace(/\s+([）】」』、。．])/gu, '$1')
    .replace(/([（【「『])\s+/gu, '$1')
    .replace(/\s+([:：])/gu, '$1')
    .replace(/([:：])\s+/gu, '$1');
}

function clipText(text, maxLength) {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function buildFactFromListItem(rawItem, sourceLabel, sourceUrl) {
  const detailMatch = rawItem.match(/<dd\b[^>]*>([\s\S]*?)<\/dd>/i);
  const detailText = detailMatch ? stripHtml(detailMatch[1]) : '';
  const mainText = stripHtml(rawItem.replace(/<dl\b[\s\S]*$/i, '').replace(/<ul\b[\s\S]*$/i, ''));

  if (!mainText) {
    return null;
  }

  let title = mainText;
  let detail = detailText || mainText;

  if (sourceLabel.includes('記念日')) {
    title = mainText.split('（')[0].split('(')[0].replace(/[。．]$/u, '').trim();
  } else {
    const normalizedMain = mainText.replace(/\s*[-‐－]\s*/u, ' - ');
    const parts = normalizedMain.split(' - ');
    title = clipText(parts.length > 1 ? parts.slice(1).join(' - ') : normalizedMain, 44);
    detail = detailText || normalizedMain;
  }

  if (!title) {
    return null;
  }

  return {
    title,
    detail: clipText(detail, 120),
    sourceLabel,
    sourceUrl,
  };
}

async function fetchTodayFactFromWikipedia(date) {
  const pageTitle = buildWikipediaPageTitle(date);
  const sourceUrl = buildWikipediaPageUrl(pageTitle);
  const sections = await fetchWikipediaSections(pageTitle);
  const resolvedSection = resolveFactSection(sections);

  if (!resolvedSection) {
    return null;
  }

  const sectionHtml = await fetchWikipediaSectionHtml(pageTitle, resolvedSection.index);
  const items = extractTopLevelListItems(sectionHtml);

  for (const item of items) {
    const fact = buildFactFromListItem(item, resolvedSection.sourceLabel, sourceUrl);
    if (fact) {
      return fact;
    }
  }

  return null;
}

export async function loadTodayFact(date) {
  const cacheKey = buildWikipediaPageTitle(date);
  const cached = todayFactCache.get(cacheKey);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return cached.fact;
  }

  const fact = await fetchTodayFactFromWikipedia(date);
  todayFactCache.set(cacheKey, {
    fact,
    expiresAt: now + FACT_CACHE_TTL_MS,
  });
  return fact;
}
