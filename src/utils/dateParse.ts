export type ClipboardHighlight = {
  start: number
  end: number
  kind: 'date' | 'time'
}

export type ParsedClipboard = {
  start: string
  end?: string
  allDay: boolean
  title?: string
  highlights?: ClipboardHighlight[]
}

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

const pad = (num: number) => String(num).padStart(2, '0')

const toValidDate = (year: number, month: number, day: number) => {
  const date = new Date(year, month - 1, day)
  return isNaN(date.getTime()) ? null : date
}

const setTimeOnDate = (base: Date, hour: number, minute: number) => {
  const date = new Date(base)
  date.setHours(hour, minute, 0, 0)
  return date
}

export const formatDateTimeLocal = (date: Date) => {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`
}

export const formatDateOnly = (date: Date) => {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export const parseDateOnlyValue = (value: string) => {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const [, y, mo, d] = m
  const date = new Date(Number(y), Number(mo) - 1, Number(d))
  return isNaN(date.getTime()) ? null : date
}

export const parseDateTimeValue = (value: string) => {
  if (!value) return null
  const date = new Date(value)
  return isNaN(date.getTime()) ? null : date
}

export const addHours = (date: Date, hours: number) => new Date(date.getTime() + hours * HOUR_MS)
export const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS)

const extractTimesWithRange = (
  text: string
): Array<{ time: [number, number]; range: [number, number] }> => {
  const colonTimes = [...text.matchAll(/(\d{1,2}):(\d{2})/g)].map((m) => {
    const start = m.index ?? 0
    return {
      time: [Number(m[1]), Number(m[2])] as [number, number],
      range: [start, start + m[0].length] as [number, number],
    }
  })
  const kanjiTimes = [...text.matchAll(/(\d{1,2})\s*時(?:\s*(\d{1,2})\s*分?)?/g)].map((m) => {
    const start = m.index ?? 0
    const hour = Number(m[1])
    const minute = m[2] ? Number(m[2]) : 0
    return {
      time: [hour, minute] as [number, number],
      range: [start, start + m[0].length] as [number, number],
    }
  })
  return [...colonTimes, ...kanjiTimes]
}

const detectBaseDate = (
  text: string,
  allowTodayFallback = false
): { date: Date | null; range?: [number, number] } => {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const kanjiDigits = '〇零一二三四五六七八九十'
  const toNumberFromKanji = (value: string) => {
    if (!value || [...value].some((c) => !kanjiDigits.includes(c))) return null
    if (value === '十') return 10

    const digit = (c: string) => {
      const map: Record<string, number> = {
        零: 0,
        一: 1,
        二: 2,
        三: 3,
        四: 4,
        五: 5,
        六: 6,
        七: 7,
        八: 8,
        九: 9,
      }
      return map[c] ?? null
    }

    if (value.includes('十')) {
      const [tensRaw, onesRaw] = value.split('十')
      const tens = tensRaw ? digit(tensRaw) : 1
      const ones = onesRaw ? (onesRaw.length === 1 ? digit(onesRaw) : null) : 0
      if (tens === null || ones === null) return null
      return tens * 10 + ones
    }

    const nums = [...value].map(digit)
    if (nums.some((n) => n === null)) return null
    return Number(nums.join(''))
  }

  const kanjiDate = text.match(
    /([〇零一二三四五六七八九十]{1,3})\s*月\s*([〇零一二三四五六七八九十]{1,3})\s*日?/
  )
  if (kanjiDate) {
    const start = kanjiDate.index ?? 0
    const [, km, kd] = kanjiDate
    const month = toNumberFromKanji(km)
    const day = toNumberFromKanji(kd)
    if (month && day) {
      return {
        date: toValidDate(now.getFullYear(), month, day),
        range: [start, start + kanjiDate[0].length],
      }
    }
  }

  const fullDate = text.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (fullDate) {
    const start = fullDate.index ?? 0
    const [, y, m, d] = fullDate
    return {
      date: toValidDate(Number(y), Number(m), Number(d)),
      range: [start, start + fullDate[0].length],
    }
  }

  const jpDate = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日?/)
  if (jpDate) {
    const start = jpDate.index ?? 0
    const [, m, d] = jpDate
    return {
      date: toValidDate(now.getFullYear(), Number(m), Number(d)),
      range: [start, start + jpDate[0].length],
    }
  }

  const shortDate = text.match(/(\d{1,2})[-/](\d{1,2})/)
  if (shortDate) {
    const start = shortDate.index ?? 0
    const [, m, d] = shortDate
    return {
      date: toValidDate(now.getFullYear(), Number(m), Number(d)),
      range: [start, start + shortDate[0].length],
    }
  }

  const todayMatch = text.match(/今日|本日/)
  if (todayMatch) {
    const start = todayMatch.index ?? 0
    return { date: today, range: [start, start + todayMatch[0].length] }
  }

  const tomorrowMatch = text.match(/明日|あした|あす/)
  if (tomorrowMatch) {
    const start = tomorrowMatch.index ?? 0
    return { date: addDays(today, 1), range: [start, start + tomorrowMatch[0].length] }
  }

  const afterTomorrowMatch = text.match(/明後日|あさって/)
  if (afterTomorrowMatch) {
    const start = afterTomorrowMatch.index ?? 0
    return { date: addDays(today, 2), range: [start, start + afterTomorrowMatch[0].length] }
  }

  if (allowTodayFallback) {
    return { date: today }
  }

  return { date: null }
}

const buildTimedClipboard = (
  baseDate: Date,
  startTime: [number, number],
  endTime: [number, number],
  headline?: string
): ParsedClipboard => {
  const start = setTimeOnDate(baseDate, startTime[0], startTime[1])
  const end = setTimeOnDate(baseDate, endTime[0], endTime[1])

  if (end <= start) {
    end.setTime(start.getTime() + HOUR_MS)
  }

  return {
    allDay: false,
    start: formatDateTimeLocal(start),
    end: formatDateTimeLocal(end),
    title: headline,
  }
}

const buildSingleTimeClipboard = (
  baseDate: Date,
  time: [number, number],
  headline?: string
): ParsedClipboard => {
  const start = setTimeOnDate(baseDate, time[0], time[1])
  const end = addHours(start, 1)

  return {
    allDay: false,
    start: formatDateTimeLocal(start),
    end: formatDateTimeLocal(end),
    title: headline,
  }
}

const buildAllDayClipboard = (baseDate: Date, headline?: string): ParsedClipboard => ({
  allDay: true,
  start: formatDateOnly(baseDate),
  title: headline,
})

export const parseClipboardContent = (raw: string): ParsedClipboard | null => {
  const text = raw.trim()
  if (!text) return null

  const timeMatches = extractTimesWithRange(text)
  const times = timeMatches.map((t) => t.time)
  const baseDateInfo = detectBaseDate(text, times.length > 0)
  if (!baseDateInfo.date) return null
  const highlights: ClipboardHighlight[] = []
  if (baseDateInfo.range) {
    highlights.push({ start: baseDateInfo.range[0], end: baseDateInfo.range[1], kind: 'date' })
  }

  const headline = text.split(/\r?\n/)[0]?.trim() || undefined

  if (times.length >= 2) {
    const result = buildTimedClipboard(baseDateInfo.date, times[0], times[1], headline)
    highlights.push({ start: timeMatches[0].range[0], end: timeMatches[0].range[1], kind: 'time' })
    highlights.push({ start: timeMatches[1].range[0], end: timeMatches[1].range[1], kind: 'time' })
    return { ...result, highlights }
  }

  if (times.length === 1) {
    const result = buildSingleTimeClipboard(baseDateInfo.date, times[0], headline)
    highlights.push({ start: timeMatches[0].range[0], end: timeMatches[0].range[1], kind: 'time' })
    return { ...result, highlights }
  }

  return { ...buildAllDayClipboard(baseDateInfo.date, headline), highlights }
}
