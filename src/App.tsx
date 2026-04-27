import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import type { GroupBase, StylesConfig } from 'react-select'
import Select from 'react-select'
import './App.css'
import { formSelectStyles } from './formSelectStyles'

const PAGE_TITLE = 'How much time left with my parents…'

type NumberSelectOption = { value: number; label: string }

function clampNonNegativeNumber(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

function formatNumber(n: number, maxFractionDigits = 1): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: maxFractionDigits,
    minimumFractionDigits: 0,
  }).format(n)
}

function formatDaysCount(n: number): string {
  return `${formatNumber(n, 1)} Days`
}

function computeAgeYearsFromBirthYear(birthYear: number | null, now = new Date()): number | null {
  if (birthYear == null) return null
  if (!Number.isFinite(birthYear) || birthYear <= 0) return null
  return now.getFullYear() - birthYear
}

type Sex = 'male' | 'female'

/**
 * A lightweight cohort life expectancy estimate (at birth) by birth year.
 * This is intentionally simple and is not country-specific.
 */
function expectedAgeAtDeathFromBirthYear(sex: Sex, birthYear: number): number {
  const anchors =
    sex === 'male'
      ? ([
          [1900, 47],
          [1910, 50],
          [1920, 55],
          [1930, 60],
          [1940, 65],
          [1950, 70],
          [1960, 73],
          [1970, 75],
          [1980, 77],
          [1990, 79],
          [2000, 80],
          [2010, 81],
          [2020, 82],
        ] as const)
      : ([
          [1900, 50],
          [1910, 53],
          [1920, 58],
          [1930, 63],
          [1940, 69],
          [1950, 74],
          [1960, 77],
          [1970, 79],
          [1980, 81],
          [1990, 83],
          [2000, 84],
          [2010, 85],
          [2020, 86],
        ] as const)

  if (birthYear <= anchors[0][0]) return anchors[0][1]
  if (birthYear >= anchors[anchors.length - 1][0]) return anchors[anchors.length - 1][1]

  for (let i = 0; i < anchors.length - 1; i++) {
    const [y0, a0] = anchors[i]
    const [y1, a1] = anchors[i + 1]
    if (birthYear >= y0 && birthYear <= y1) {
      const t = (birthYear - y0) / (y1 - y0)
      return a0 + (a1 - a0) * t
    }
  }

  return anchors[anchors.length - 1][1]
}

type VisitUnit = 'hours' | 'days'

const UNIT_SELECT_OPTIONS: { value: VisitUnit; label: string }[] = [
  { value: 'hours', label: 'hours' },
  { value: 'days', label: 'days' },
]

type UnitSelectOption = { value: VisitUnit; label: string }

const numberSelectStyles = formSelectStyles as StylesConfig<
  NumberSelectOption,
  false,
  GroupBase<NumberSelectOption>
>
const unitSelectStyles = formSelectStyles as StylesConfig<UnitSelectOption, false, GroupBase<UnitSelectOption>>

/** Calendar-day visits: 12 h together time per day (not 24). */
function getHoursPerVisit(visitLength: number, visitUnit: VisitUnit): number {
  const length = clampNonNegativeNumber(visitLength)
  return visitUnit === 'days' ? length * 12 : length
}

function visitHoursInYears(
  years: number,
  visitsPerYear: number,
  visitLength: number,
  visitUnit: VisitUnit,
): { totalHours: number; totalDays: number; totalMonths: number; hoursPerVisit: number } {
  const y = clampNonNegativeNumber(years)
  const visits = clampNonNegativeNumber(visitsPerYear)
  const hoursPerVisit = getHoursPerVisit(visitLength, visitUnit)
  const totalHours = visits * y * hoursPerVisit
  const totalDays = totalHours / 24
  const totalMonths = totalDays / (365.25 / 12)
  return { totalHours, totalDays, totalMonths, hoursPerVisit }
}

export default function App() {
  const yearSelectOptions = useMemo((): NumberSelectOption[] => {
    const out: NumberSelectOption[] = []
    for (let y = 1940; y <= 2010; y++) out.push({ value: y, label: String(y) })
    return out
  }, [])

  const visitSelectOptions = useMemo((): NumberSelectOption[] => {
    return [
      { value: 1, label: '1' },
      { value: 2, label: '2' },
      { value: 3, label: '3' },
      { value: 4, label: '4' },
      { value: 6, label: '6' },
      { value: 8, label: '8' },
      { value: 10, label: '10' },
      { value: 12, label: '12 (monthly)' },
      { value: 24, label: '24 (twice a month)' },
      { value: 52, label: '52 (weekly)' },
    ]
  }, [])

  useEffect(() => {
    document.title = PAGE_TITLE
  }, [])

  const [dadBirthYear, setDadBirthYear] = useState<number | ''>('')
  const [mumBirthYear, setMumBirthYear] = useState<number | ''>('')
  const [visitsPerYear, setVisitsPerYear] = useState(0)
  const [visitLength, setVisitLength] = useState<number | ''>('')
  const [visitUnit, setVisitUnit] = useState<VisitUnit>('hours')
  type View = 'edit' | 'results'
  const [view, setView] = useState<View>('edit')
  type PngUi = 'idle' | 'busy' | 'clipboard' | 'download' | 'fail'
  const [copyImgUi, setCopyImgUi] = useState<PngUi>('idle')
  const [postXUi, setPostXUi] = useState<PngUi>('idle')
  const captureRef = useRef<HTMLDivElement | null>(null)
  const lastShareRenderRef = useRef<{
    key: string
    blob: Blob
    width: number
    height: number
  } | null>(null)

  const dadAge = useMemo(
    () => computeAgeYearsFromBirthYear(dadBirthYear === '' ? null : dadBirthYear),
    [dadBirthYear],
  )
  const mumAge = useMemo(
    () => computeAgeYearsFromBirthYear(mumBirthYear === '' ? null : mumBirthYear),
    [mumBirthYear],
  )

  const dadRemainingYears = useMemo(() => {
    if (dadAge == null) return null
    const by = dadBirthYear === '' ? null : dadBirthYear
    if (by == null) return null
    const expected = expectedAgeAtDeathFromBirthYear('male', by)
    return Math.max(0, expected - dadAge)
  }, [dadAge, dadBirthYear])

  const mumRemainingYears = useMemo(() => {
    if (mumAge == null) return null
    const by = mumBirthYear === '' ? null : mumBirthYear
    if (by == null) return null
    const expected = expectedAgeAtDeathFromBirthYear('female', by)
    return Math.max(0, expected - mumAge)
  }, [mumAge, mumBirthYear])

  const timeBreakdown = useMemo(() => {
    const vLen = clampNonNegativeNumber(visitLength)
    const dr = dadRemainingYears ?? 0
    const mr = mumRemainingYears ?? 0
    if (vLen <= 0 || !visitsPerYear) {
      return {
        both: { totalDays: 0, totalHours: 0, totalMonths: 0, years: 0 },
        mumAfterDad: { totalDays: 0, totalHours: 0, totalMonths: 0, years: 0 },
        dadAfterMum: { totalDays: 0, totalHours: 0, totalMonths: 0, years: 0 },
        hoursPerVisit: 0,
      }
    }

    const yearsBoth = Math.min(dr, mr)
    const dadDiesFirst = dr <= mr
    const yearsMumSolo = dadDiesFirst ? Math.max(0, mr - dr) : 0
    const yearsDadSolo = !dadDiesFirst ? Math.max(0, dr - mr) : 0

    const both = visitHoursInYears(yearsBoth, visitsPerYear, vLen, visitUnit)
    const mumAfterDad = visitHoursInYears(yearsMumSolo, visitsPerYear, vLen, visitUnit)
    const dadAfterMum = visitHoursInYears(yearsDadSolo, visitsPerYear, vLen, visitUnit)

    return {
      both: { ...both, years: yearsBoth },
      mumAfterDad: { ...mumAfterDad, years: yearsMumSolo },
      dadAfterMum: { ...dadAfterMum, years: yearsDadSolo },
      hoursPerVisit: getHoursPerVisit(vLen, visitUnit),
    }
  }, [dadRemainingYears, mumRemainingYears, visitLength, visitUnit, visitsPerYear])

  const hasEnoughInputs =
    visitsPerYear > 0 &&
    clampNonNegativeNumber(visitLength) > 0 &&
    typeof dadBirthYear === 'number' &&
    typeof mumBirthYear === 'number'

  const assumptionLines = useMemo((): string[] => {
    if (!hasEnoughInputs) {
      return ['Fill in every field, then tap Calculate. Assumptions for your model will be listed here.']
    }
    const dadBy = typeof dadBirthYear === 'number' ? dadBirthYear : null
    const mumBy = typeof mumBirthYear === 'number' ? mumBirthYear : null
    const maleLifespan = dadBy == null ? null : expectedAgeAtDeathFromBirthYear('male', dadBy)
    const femaleLifespan = mumBy == null ? null : expectedAgeAtDeathFromBirthYear('female', mumBy)
    const parts: string[] = []
    if (visitUnit === 'days') {
      parts.push('12 hours together per calendar day when visit length is in days.')
    }
    if (maleLifespan != null) {
      parts.push(
        `Male (Dad) life expectancy at birth: ~${formatNumber(maleLifespan, 1)} years.`,
      )
    }
    if (femaleLifespan != null) {
      parts.push(
        `Female (Mum) life expectancy at birth: ~${formatNumber(femaleLifespan, 1)} years.`,
      )
    }
    return parts.length > 0 ? parts : ['—']
  }, [hasEnoughInputs, visitUnit, dadBirthYear, mumBirthYear])

  const ages = useMemo(() => {
    if (dadAge == null && mumAge == null) return '—'
    if (dadAge != null && mumAge != null) return `Dad: ${dadAge} • Mum: ${mumAge}`
    if (dadAge != null) return `Dad: ${dadAge}`
    return `Mum: ${mumAge}`
  }, [dadAge, mumAge])

  const siteUrl = useMemo(() => {
    const fromEnv = import.meta.env.VITE_SITE_URL
    if (typeof fromEnv === 'string' && fromEnv.trim()) {
      const u = fromEnv.trim()
      return u.endsWith('/') ? u : `${u}/`
    }
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/`
    }
    return ''
  }, [])

  const shareCardUrl = useMemo(() => {
    // Sample URL for now (replace with your live domain when ready)
    return 'https://example.com/parenttimer'
  }, [])

  const tweetBody = useMemo(() => {
    if (!hasEnoughInputs) return ''
    const both = `${formatNumber(timeBreakdown.both.totalDays, 1)} days`
    const parts: string[] = [`I have ${both} left with both parents`]

    if (timeBreakdown.mumAfterDad.years > 0) {
      const solo = `${formatNumber(timeBreakdown.mumAfterDad.totalDays, 1)} days`
      parts.push(`and ${solo} left with Mum after Dad passes`)
    }
    if (timeBreakdown.dadAfterMum.years > 0) {
      const solo = `${formatNumber(timeBreakdown.dadAfterMum.totalDays, 1)} days`
      parts.push(`and ${solo} left with Dad after Mum passes`)
    }

    const link = siteUrl || shareCardUrl
    return `${parts.join(' ')}.\n${link}`.trim()
  }, [hasEnoughInputs, timeBreakdown, siteUrl, shareCardUrl])

  const xIntentHref = useMemo(() => {
    const u = new URL('https://twitter.com/intent/tweet')
    if (tweetBody) u.searchParams.set('text', tweetBody)
    return u.toString()
  }, [tweetBody])

  const shareRenderKey = useMemo(() => {
    const soloLabel =
      timeBreakdown.mumAfterDad.years > 0
        ? 'mumAfterDad'
        : timeBreakdown.dadAfterMum.years > 0
          ? 'dadAfterMum'
          : 'none'
    return JSON.stringify({
      both: formatNumber(timeBreakdown.both.totalDays, 1),
      mumSolo: formatNumber(timeBreakdown.mumAfterDad.totalDays, 1),
      dadSolo: formatNumber(timeBreakdown.dadAfterMum.totalDays, 1),
      ages,
      dadY: dadRemainingYears == null ? null : formatNumber(dadRemainingYears, 1),
      mumY: mumRemainingYears == null ? null : formatNumber(mumRemainingYears, 1),
      url: shareCardUrl,
      soloLabel,
    })
  }, [timeBreakdown, ages, dadRemainingYears, mumRemainingYears, shareCardUrl])

  const getCaptureScale = useCallback(() => {
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    // Mobile perf: keep this modest; share card is already large.
    return Math.max(1, Math.min(1.6, dpr))
  }, [])

  const renderShareCardPng = useCallback(async (): Promise<{ blob: Blob; width: number; height: number } | null> => {
    const cached = lastShareRenderRef.current
    if (cached && cached.key === shareRenderKey) {
      return { blob: cached.blob, width: cached.width, height: cached.height }
    }

    const el = captureRef.current
    if (!el) return null

    try {
      const scale = getCaptureScale()
      const canvas = await html2canvas(el, {
        backgroundColor: '#f3f0ff',
        scale,
        useCORS: true,
        logging: false,
      })
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) return null

      lastShareRenderRef.current = { key: shareRenderKey, blob, width: canvas.width, height: canvas.height }
      return { blob, width: canvas.width, height: canvas.height }
    } catch {
      return null
    }
  }, [getCaptureScale, shareRenderKey])

  useEffect(() => {
    if (view !== 'results') return
    if (!hasEnoughInputs) return
    if (lastShareRenderRef.current?.key === shareRenderKey) return

    const w = window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number
      cancelIdleCallback?: (id: number) => void
    }

    let cancelled = false
    const run = () => {
      if (cancelled) return
      void renderShareCardPng()
    }

    const id = w.requestIdleCallback ? w.requestIdleCallback(run, { timeout: 1200 }) : window.setTimeout(run, 50)
    return () => {
      cancelled = true
      if (w.cancelIdleCallback && typeof id === 'number') w.cancelIdleCallback(id)
      else window.clearTimeout(id)
    }
  }, [view, hasEnoughInputs, shareRenderKey, renderShareCardPng])

  const copyResultsAsPng = useCallback(async (): Promise<'clipboard' | 'download' | 'fail'> => {
    try {
      const rendered = await renderShareCardPng()
      if (!rendered) return 'fail'
      const { blob } = rendered
      try {
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
        return 'clipboard'
      } catch {
        try {
          const a = document.createElement('a')
          const url = URL.createObjectURL(blob)
          a.href = url
          a.download = 'parent-time-results.png'
          a.click()
          window.setTimeout(() => URL.revokeObjectURL(url), 4000)
          return 'download'
        } catch {
          return 'fail'
        }
      }
    } catch {
      return 'fail'
    }
  }, [renderShareCardPng])

  const shareToX = useCallback(async (): Promise<'shared' | 'fallback'> => {
    const rendered = await renderShareCardPng()
    if (!rendered) return 'fallback'
    const { blob } = rendered

    const file = new File([blob], 'parent-time-results.png', { type: blob.type || 'image/png' })
    const shareData: ShareData = { files: [file], text: tweetBody || undefined }

    try {
      if (navigator.canShare?.(shareData)) {
        await navigator.share(shareData)
        return 'shared'
      }
    } catch {
      // ignore and fallback
    }

    return 'fallback'
  }, [renderShareCardPng, tweetBody])

  return (
    <main className="page">
      <div className="assumptions-hover assumptions-hover--page">
        <button
          type="button"
          className="assumptions-icon-btn"
          aria-label="Assumptions"
          aria-describedby="assumptions-tooltip"
        >
          <span className="assumptions-icon-outer" aria-hidden>
            <span className="assumptions-icon-i">i</span>
          </span>
        </button>
        <div id="assumptions-tooltip" className="assumptions-tooltip" role="tooltip">
          {assumptionLines.map((line, i) => (
            <div key={i} className="assumptions-block">
              {i > 0 ? <hr className="assumptions-divider" /> : null}
              <p className="assumptions-line">{line}</p>
            </div>
          ))}
        </div>
      </div>

      {view === 'edit' ? (
        <section className="card card--inputs" aria-label="Inputs">
          <h2 className="card-title">{PAGE_TITLE}</h2>
          <div className="stack">
            <div className="field">
              <label htmlFor="dadBirthYear">Dad’s birth year</label>
              <div className="form-select-wrap">
                <Select<NumberSelectOption>
                  inputId="dadBirthYear"
                  instanceId="dad-birth-year"
                  options={yearSelectOptions}
                  styles={numberSelectStyles}
                  value={yearSelectOptions.find((o) => o.value === dadBirthYear) ?? null}
                  onChange={(opt) => setDadBirthYear(opt ? opt.value : '')}
                  placeholder="Select…"
                  isClearable
                  isSearchable
                  menuPosition="fixed"
                  menuPlacement="auto"
                  menuPortalTarget={document.body}
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="mumBirthYear">Mum’s birth year</label>
              <div className="form-select-wrap">
                <Select<NumberSelectOption>
                  inputId="mumBirthYear"
                  instanceId="mum-birth-year"
                  options={yearSelectOptions}
                  styles={numberSelectStyles}
                  value={yearSelectOptions.find((o) => o.value === mumBirthYear) ?? null}
                  onChange={(opt) => setMumBirthYear(opt ? opt.value : '')}
                  placeholder="Select…"
                  isClearable
                  isSearchable
                  menuPosition="fixed"
                  menuPlacement="auto"
                  menuPortalTarget={document.body}
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="visitsPerYear">Visits per year</label>
              <div className="form-select-wrap">
                <Select<NumberSelectOption>
                  inputId="visitsPerYear"
                  instanceId="visits-per-year"
                  options={visitSelectOptions}
                  styles={numberSelectStyles}
                  value={visitSelectOptions.find((o) => o.value === visitsPerYear) ?? null}
                  onChange={(opt) => setVisitsPerYear(opt ? opt.value : 0)}
                  placeholder="Select…"
                  isSearchable={false}
                  menuPosition="fixed"
                  menuPlacement="auto"
                  menuPortalTarget={document.body}
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="visitLength">Length of each visit</label>
              <div className="row">
                <input
                  id="visitLength"
                  name="visitLength"
                  type="number"
                  min={0}
                  step={0.25}
                  inputMode="decimal"
                  placeholder="e.g. 6"
                  value={visitLength}
                  onChange={(e) => {
                    const next = e.target.value
                    setVisitLength(next === '' ? '' : Number(next))
                  }}
                />
                <div className="form-select-wrap form-select-wrap--unit">
                  <Select<UnitSelectOption>
                    inputId="visitUnit"
                    instanceId="visit-unit"
                    options={UNIT_SELECT_OPTIONS}
                    styles={unitSelectStyles}
                    value={UNIT_SELECT_OPTIONS.find((o) => o.value === visitUnit) ?? null}
                    onChange={(opt) => setVisitUnit(opt ? opt.value : 'hours')}
                    isSearchable={false}
                    menuPosition="fixed"
                    menuPlacement="auto"
                    menuPortalTarget={document.body}
                    aria-label="Visit length unit"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="actions">
            <button
              className="primary"
              type="button"
              disabled={!hasEnoughInputs}
              onClick={() => {
                if (!hasEnoughInputs) return
                setView('results')
              }}
            >
              Calculate
            </button>
          </div>
        </section>
      ) : (
        <section className="card" aria-label="Results">
          <div className="share-capture-host" aria-hidden>
            <div ref={captureRef} className="share-card">
              <h2 className="share-card__title">{PAGE_TITLE}</h2>

              <div className="share-card__kpis">
                <div className="share-card__kpi share-card__kpi--primary">
                  <div className="share-card__kpiLabel">With both parents</div>
                  <div className="share-card__kpiValue">{formatDaysCount(timeBreakdown.both.totalDays)}</div>
                  <div className="share-card__kpiSub">
                    {formatNumber(timeBreakdown.both.totalHours, 0)} hours
                  </div>
                </div>

                {timeBreakdown.mumAfterDad.years > 0 ? (
                  <div className="share-card__kpi">
                    <div className="share-card__kpiLabel">With Mum, after Dad passes</div>
                    <div className="share-card__kpiValue">
                      {formatDaysCount(timeBreakdown.mumAfterDad.totalDays)}
                    </div>
                    <div className="share-card__kpiSub">
                      {formatNumber(timeBreakdown.mumAfterDad.totalHours, 0)} hours
                    </div>
                  </div>
                ) : null}

                {timeBreakdown.dadAfterMum.years > 0 ? (
                  <div className="share-card__kpi">
                    <div className="share-card__kpiLabel">With Dad, after Mum passes</div>
                    <div className="share-card__kpiValue">
                      {formatDaysCount(timeBreakdown.dadAfterMum.totalDays)}
                    </div>
                    <div className="share-card__kpiSub">
                      {formatNumber(timeBreakdown.dadAfterMum.totalHours, 0)} hours
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="share-card__meta">
                <div className="share-card__metaRow">
                  <span className="share-card__metaLabel">Parent ages today</span>
                  <span className="share-card__metaValue">{ages}</span>
                </div>
                <div className="share-card__metaRow">
                  <span className="share-card__metaLabel">Remaining years</span>
                  <span className="share-card__metaValue">
                    Dad: {dadRemainingYears == null ? '—' : formatNumber(dadRemainingYears, 1)} • Mum:{' '}
                    {mumRemainingYears == null ? '—' : formatNumber(mumRemainingYears, 1)}
                  </span>
                </div>
              </div>

              <div className="share-card__footer">
                <span className="share-card__footerUrl">{shareCardUrl}</span>
              </div>
            </div>
          </div>

          <div className="results-capture-surface">
            <h2 className="results-capture-title">{PAGE_TITLE}</h2>
            <div className="kpis" role="status" aria-live="polite">
              <div className="kpi">
                <div className="kpiLabel">With both parents</div>
                <div className="kpiValue">{formatDaysCount(timeBreakdown.both.totalDays)}</div>
                <div className="kpiSub">{formatNumber(timeBreakdown.both.totalHours, 0)} hours</div>
              </div>

              {timeBreakdown.mumAfterDad.years > 0 ? (
                <div className="kpi">
                  <div className="kpiLabel">With Mum, after Dad passes</div>
                  <div className="kpiValue">{formatDaysCount(timeBreakdown.mumAfterDad.totalDays)}</div>
                  <div className="kpiSub">{formatNumber(timeBreakdown.mumAfterDad.totalHours, 0)} hours</div>
                </div>
              ) : null}

              {timeBreakdown.dadAfterMum.years > 0 ? (
                <div className="kpi">
                  <div className="kpiLabel">With Dad, after Mum passes</div>
                  <div className="kpiValue">{formatDaysCount(timeBreakdown.dadAfterMum.totalDays)}</div>
                  <div className="kpiSub">{formatNumber(timeBreakdown.dadAfterMum.totalHours, 0)} hours</div>
                </div>
              ) : null}
            </div>

            <div className="details details--compact">
              <div className="detailRow">
                <span className="muted">Parent ages today</span>
                <span className="mono">{ages}</span>
              </div>
              <div className="detailRow">
                <span className="muted">Remaining years</span>
                <span className="mono">
                  Dad: {dadRemainingYears == null ? '—' : formatNumber(dadRemainingYears, 1)} • Mum:{' '}
                  {mumRemainingYears == null ? '—' : formatNumber(mumRemainingYears, 1)}
                </span>
              </div>
            </div>
          </div>

          <div className="actions">
            <div className="actions-shareRow">
              <button
                type="button"
                className="secondary btn-inline"
                disabled={copyImgUi === 'busy' || postXUi === 'busy'}
                onClick={async () => {
                  setCopyImgUi('busy')
                  const r = await copyResultsAsPng()
                  setCopyImgUi(r === 'clipboard' ? 'clipboard' : r === 'download' ? 'download' : 'fail')
                  window.setTimeout(() => setCopyImgUi('idle'), 2500)
                }}
              >
                {copyImgUi === 'busy'
                  ? '…'
                  : copyImgUi === 'clipboard'
                    ? 'Image copied'
                    : copyImgUi === 'download'
                      ? 'Image saved'
                      : copyImgUi === 'fail'
                        ? 'Try again'
                        : 'Copy image'}
              </button>
              <button
                type="button"
                className="secondary btn-inline"
                disabled={copyImgUi === 'busy' || postXUi === 'busy'}
                onClick={async () => {
                  setPostXUi('busy')
                  const shared = await shareToX()
                  if (shared !== 'shared') {
                    const r = await copyResultsAsPng()
                    window.open(xIntentHref, '_blank', 'noopener,noreferrer')
                    setPostXUi(r === 'clipboard' ? 'clipboard' : r === 'download' ? 'download' : 'fail')
                  } else {
                    setPostXUi('clipboard')
                  }
                  window.setTimeout(() => setPostXUi('idle'), 2500)
                }}
              >
                {postXUi === 'busy'
                  ? '…'
                  : postXUi === 'clipboard' || postXUi === 'download'
                    ? 'Open X — paste image'
                    : postXUi === 'fail'
                      ? 'Link only (no image)'
                    : 'Share on X'}
              </button>
            </div>
            <button className="secondary actions-recalc" type="button" onClick={() => setView('edit')}>
              Recalculate
            </button>
          </div>
        </section>
      )}
    </main>
  )
}

