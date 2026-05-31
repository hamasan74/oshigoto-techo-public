function parseIsoDate(date: string) {
  const [yearText, monthText, dayText] = date.split('-');
  return {
    year: Number(yearText),
    month: Number(monthText),
    day: Number(dayText),
  };
}

function formatIsoDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addDays(date: string, deltaDays: number) {
  const current = new Date(`${date}T00:00:00`);
  const shifted = new Date(current.getFullYear(), current.getMonth(), current.getDate() + deltaDays);
  return formatIsoDate(shifted.getFullYear(), shifted.getMonth() + 1, shifted.getDate());
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, occurrence: number) {
  const firstDay = new Date(year, month - 1, 1);
  const firstWeekday = firstDay.getDay();
  const offset = (weekday - firstWeekday + 7) % 7;
  return 1 + offset + (occurrence - 1) * 7;
}

function getVernalEquinoxDay(year: number) {
  if (year < 1980 || year > 2099) {
    return 20;
  }

  return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

function getAutumnalEquinoxDay(year: number) {
  if (year < 1980 || year > 2099) {
    return 23;
  }

  return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

const specialHolidayNames = new Map<string, string>([
  ['2020-07-23', '海の日'],
  ['2020-07-24', 'スポーツの日'],
  ['2020-08-10', '山の日'],
  ['2021-07-22', '海の日'],
  ['2021-07-23', 'スポーツの日'],
  ['2021-08-08', '山の日'],
  ['2021-08-09', '振替休日'],
]);

function getBaseHolidayName(date: string) {
  const specialHoliday = specialHolidayNames.get(date);
  if (specialHoliday) {
    return specialHoliday;
  }

  const { year, month, day } = parseIsoDate(date);

  switch (month) {
    case 1:
      if (day === 1) {
        return '元日';
      }
      if (year >= 2000 && day === nthWeekdayOfMonth(year, 1, 1, 2)) {
        return '成人の日';
      }
      if (year >= 1949 && year < 2000 && day === 15) {
        return '成人の日';
      }
      break;
    case 2:
      if (year >= 1967 && day === 11) {
        return '建国記念の日';
      }
      if (year >= 2020 && day === 23) {
        return '天皇誕生日';
      }
      break;
    case 3:
      if (day === getVernalEquinoxDay(year)) {
        return '春分の日';
      }
      break;
    case 4:
      if (day === 29) {
        if (year >= 2007) {
          return '昭和の日';
        }
        if (year >= 1989) {
          return 'みどりの日';
        }
        return '天皇誕生日';
      }
      break;
    case 5:
      if (day === 3) {
        return '憲法記念日';
      }
      if (day === 4 && year >= 2007) {
        return 'みどりの日';
      }
      if (day === 5) {
        return 'こどもの日';
      }
      break;
    case 7:
      if (year >= 2003 && year !== 2020 && year !== 2021 && day === nthWeekdayOfMonth(year, 7, 1, 3)) {
        return '海の日';
      }
      if (year >= 1996 && year < 2003 && day === 20) {
        return '海の日';
      }
      break;
    case 8:
      if (year >= 2016 && year !== 2020 && year !== 2021 && day === 11) {
        return '山の日';
      }
      break;
    case 9:
      if (year >= 2003 && day === nthWeekdayOfMonth(year, 9, 1, 3)) {
        return '敬老の日';
      }
      if (year >= 1966 && year < 2003 && day === 15) {
        return '敬老の日';
      }
      if (day === getAutumnalEquinoxDay(year)) {
        return '秋分の日';
      }
      break;
    case 10:
      if (year >= 2022 && day === nthWeekdayOfMonth(year, 10, 1, 2)) {
        return 'スポーツの日';
      }
      if (year >= 2000 && year < 2020 && day === nthWeekdayOfMonth(year, 10, 1, 2)) {
        return '体育の日';
      }
      if (year >= 1966 && year < 2000 && day === 10) {
        return '体育の日';
      }
      break;
    case 11:
      if (day === 3) {
        return '文化の日';
      }
      if (day === 23) {
        return '勤労感謝の日';
      }
      break;
    case 12:
      if (year >= 1989 && year <= 2018 && day === 23) {
        return '天皇誕生日';
      }
      break;
    default:
      break;
  }

  return null;
}

function buildHolidayMapForYear(year: number) {
  const holidayMap = new Map<string, string>();
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year, 11, 31);

  for (let current = new Date(startDate); current <= endDate; current.setDate(current.getDate() + 1)) {
    const date = formatIsoDate(current.getFullYear(), current.getMonth() + 1, current.getDate());
    const name = getBaseHolidayName(date);
    if (name) {
      holidayMap.set(date, name);
    }
  }

  if (year >= 1973) {
    const sundayHolidayDates = Array.from(holidayMap.keys()).filter((date) => {
      const current = new Date(`${date}T00:00:00`);
      return current.getDay() === 0;
    });

    sundayHolidayDates.forEach((date) => {
      let substituteDate = addDays(date, 1);
      while (holidayMap.has(substituteDate)) {
        substituteDate = addDays(substituteDate, 1);
      }
      if (substituteDate.startsWith(`${year}-`)) {
        holidayMap.set(substituteDate, '振替休日');
      }
    });
  }

  if (year >= 1985) {
    for (let month = 1; month <= 12; month += 1) {
      const daysInMonth = new Date(year, month, 0).getDate();
      for (let day = 2; day < daysInMonth; day += 1) {
        const currentDate = formatIsoDate(year, month, day);
        if (holidayMap.has(currentDate)) {
          continue;
        }

        const current = new Date(`${currentDate}T00:00:00`);
        if (current.getDay() === 0) {
          continue;
        }

        const previousDate = addDays(currentDate, -1);
        const nextDate = addDays(currentDate, 1);
        if (holidayMap.has(previousDate) && holidayMap.has(nextDate)) {
          holidayMap.set(currentDate, '国民の休日');
        }
      }
    }
  }

  return holidayMap;
}

const holidayMapCache = new Map<number, Map<string, string>>();

function getHolidayMap(year: number) {
  const cached = holidayMapCache.get(year);
  if (cached) {
    return cached;
  }

  const holidayMap = buildHolidayMapForYear(year);
  holidayMapCache.set(year, holidayMap);
  return holidayMap;
}

export function getJapaneseHolidayName(date: string) {
  const { year } = parseIsoDate(date);
  return getHolidayMap(year).get(date) ?? null;
}

export function isJapaneseHoliday(date: string) {
  return getJapaneseHolidayName(date) !== null;
}

export function getDayOffLabel(date: string) {
  if (isJapaneseHoliday(date)) {
    return '祝';
  }

  const current = new Date(`${date}T00:00:00`);
  return current.getDay() === 0 || current.getDay() === 6 ? '休' : null;
}
