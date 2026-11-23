'use strict';

function getNextService(schedule, timeZone, now = new Date()) {
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const weekdayNumbers = Object.fromEntries(weekdays.map((day, index) => [day.toLowerCase(), index]));
  const scheduleItems = schedule.split(',').map((item) => {
    const match = item.trim().match(/^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\s+([01]\d|2[0-3]):([0-5]\d)$/i);
    if (!match) throw new Error('Invalid weekly service schedule.');
    return { weekday: weekdayNumbers[match[1].toLowerCase()], hour: Number(match[2]), minute: Number(match[3]) };
  });
  const zonedParts = (date, options) => Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, ...options }).formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  const localNow = zonedParts(now, {
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const todayWeekday = weekdayNumbers[localNow.weekday.toLowerCase()];
  const localToday = Date.UTC(Number(localNow.year), Number(localNow.month) - 1, Number(localNow.day));

  const makeCandidate = (item, daysAhead) => {
    const calendarDay = new Date(localToday + daysAhead * 24 * 60 * 60 * 1000);
    const year = calendarDay.getUTCFullYear();
    const month = calendarDay.getUTCMonth() + 1;
    const day = calendarDay.getUTCDate();
    const desiredLocalTime = Date.UTC(year, month - 1, day, item.hour, item.minute);
    let timestamp = desiredLocalTime;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const actual = zonedParts(new Date(timestamp), {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      });
      const representedLocalTime = Date.UTC(
        Number(actual.year),
        Number(actual.month) - 1,
        Number(actual.day),
        Number(actual.hour),
        Number(actual.minute),
      );
      timestamp += desiredLocalTime - representedLocalTime;
    }
    return new Date(timestamp);
  };

  const candidates = scheduleItems.map((item) => {
    const daysAhead = (item.weekday - todayWeekday + 7) % 7;
    let candidate = makeCandidate(item, daysAhead);
    if (candidate <= now) candidate = makeCandidate(item, daysAhead + 7);
    return candidate;
  }).filter((candidate) => candidate > now);
  return candidates.sort((first, second) => first - second)[0] || null;
}

module.exports = { getNextService };
