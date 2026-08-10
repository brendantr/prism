import { KEY_LIFT_WINDOW_DAYS } from './calc/keyLifts';

/**
 * WORKING SET
 * ===========
 * How much training history the app loads at startup, and why that is a bound
 * rather than "all of it".
 *
 * `refresh()` used to call `listWorkouts()` with no limit, and the Supabase
 * read selects three levels deep — every workout, every exercise block, every
 * set. Nothing capped it. A lifter training four times a week accumulates
 * roughly a hundred set rows a week, so two years in, a cold start fetched and
 * parsed on the order of ten thousand nested rows before the first screen
 * painted. The cost grew with tenure, which meant the most committed lifters —
 * the ones least likely to tolerate it — got the slowest app.
 *
 * WHY A ROW COUNT AND NOT A DATE WINDOW
 * -------------------------------------
 * A date window is the obvious bound and it is wrong here. Someone returning
 * after a shoulder injury, a move, or a busy quarter has no sessions inside any
 * recent window, and a date-bounded load would hand them an app that looks like
 * it lost their training. A row count degrades gracefully instead: it always
 * returns whatever the newest sessions are, however old they happen to be.
 */

/**
 * The longest lookback any analysis surface asks for: Insights' 12-week window.
 *
 * Held here as the binding constraint rather than imported ad hoc, because it
 * is what makes the limit below defensible instead of arbitrary.
 */
export const LONGEST_ANALYSIS_WINDOW_DAYS = 84;

/**
 * Sessions loaded at startup.
 *
 * Chosen so the working set covers `LONGEST_ANALYSIS_WINDOW_DAYS` for any
 * realistic training frequency. 120 sessions span 84 days for anyone training
 * up to about ten times a week — roughly seven months at four sessions a week,
 * and still four months at seven. Above that frequency the analysis windows
 * would be the thing to revisit, not this number.
 *
 * It is deliberately not tight. The point is to stop unbounded growth, not to
 * find the smallest number that works: a lifter with five years behind them
 * loads the same amount as one with eight months, and that is the property
 * worth having.
 */
export const WORKING_SET_WORKOUT_LIMIT = 120;

/**
 * Daily check-ins loaded at startup.
 *
 * One row per device-local day, so this is a day count in disguise: 120 rows is
 * roughly four months of unbroken check-ins, comfortably past both the 36-hour
 * staleness cutoff readiness applies and the longest analysis window.
 *
 * It is generous on purpose. Nothing in the app browses check-in history today
 * — Today reads the latest and today's, and that is the whole of it — so the
 * honest bound would be far smaller. The headroom is for the readiness-trend
 * surface that ADR-0002 anticipates: a bound sized to exactly today's callers
 * is one that silently truncates the first feature to look further back.
 */
export const CHECK_IN_LIMIT = 120;

/**
 * Personal records loaded at startup.
 *
 * **The number is headroom; the correctness is the coupling.** Records are
 * matched to sessions by History — the count on each row, and which sets are
 * marked on a session's detail — so a record bound that falls short of the
 * loaded sessions does not hide a row, it prints a **wrong number**: a session
 * that set three records renders "0 PRs". That is a worse failure than absence,
 * because nothing about it looks broken.
 *
 * What prevents it is not this constant but `loadFullHistory`, which loads the
 * full session archive and the full record set **together**, as one coverage
 * concept. This value only has to be large enough that the startup window is
 * already right for the recent sessions Today and Social show, and that History
 * is rarely mid-top-up when first rendered.
 *
 * 400 is deliberately loose. The schema permits four `pr_kind` values per
 * exercise per session, so a ceiling derived from it would be enormous and
 * useless; in practice records thin out sharply as a lifter advances, which is
 * the opposite of the shape that would make a tight bound safe.
 */
export const PERSONAL_RECORD_LIMIT = 400;

/**
 * Whether a loaded working set is known to contain every session.
 *
 * Fewer rows than the limit means the account simply has fewer sessions than
 * the cap, so nothing was left behind and History has no reason to re-fetch.
 * Exactly the limit is ambiguous — the account may have exactly that many, or
 * more — and the ambiguous case is treated as incomplete, because re-fetching
 * once unnecessarily is cheap and silently hiding a session is not.
 */
export function isCompleteWorkingSet(loaded: number, limit = WORKING_SET_WORKOUT_LIMIT): boolean {
  return loaded < limit;
}

/**
 * A guard for the relationship the limit depends on, so a future edit to either
 * number has to confront the other. Exported for its test rather than called at
 * runtime.
 */
export function coversLongestAnalysisWindow(
  sessionsPerWeek: number,
  limit = WORKING_SET_WORKOUT_LIMIT,
  windowDays = LONGEST_ANALYSIS_WINDOW_DAYS,
): boolean {
  if (sessionsPerWeek <= 0) return true;
  return (limit / sessionsPerWeek) * 7 >= windowDays;
}

/** Re-exported so the 56-day key-lift window is visibly inside the bound too. */
export { KEY_LIFT_WINDOW_DAYS };
