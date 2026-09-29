# VFL HR OS — Monthly Payroll Template (Design Spec v1)

Owner: Lead Architect. Builders: implement exactly this; raise conflicts, don't improvise business rules.

## 0. Principles

- **Reusable monthly template.** Nothing is hard-coded to a month. Everything is keyed by `PERIOD` = `YYYY-MM` (e.g. `2026-09`). HR supplies the month's numbers (working days, days worked, canteen, holidays, adjustments); the engine does the rest.
- **No averages / no inference.** Working days per population and every employee's days are *entered* by HR. The engine only validates and computes.
- **Minimum period `2026-09`.** Every write path rejects periods earlier than `MIN_PERIOD` = `2026-09`. August and earlier rows are never read for calculation or modified.
- **Add, never destroy.** Setup only creates missing tabs, fills headers on header-less tabs, and appends columns to the right. Never delete/clear/rename existing tabs or rows.
- **Fail closed.** A draft can always be calculated (with flags), but approval requires zero BLOCKER rows in readiness.
- **Single build environment:** Google Apps Script bound to the HR OS spreadsheet `10-OpV86Gvi_TlBPQ6zKQC6y7MLWqietELGU3G06exIM`. Code lives in `apps-script/` (`.gs` files, global scope, V8). Pure logic must not touch `SpreadsheetApp` so it is unit-testable in Node (`tests/`, `node --test`).
- **Privacy.** Never read or copy Aadhaar, phone numbers or passwords, and never read a column whose header contains "Password" (the OT source is read by header name, one needed column at a time, with an assertion). The only exception is the payslip identity block (UAN, ESI No, PAN, bank name / account / IFSC): it is read at generation time only, column by column, from the hidden `RAW_STAFF_MASTER` / `RAW_WORKER_MASTER` tabs (§8) and is never written to any tab, audit entry or log. Test fixtures with employee data live outside the repo only.
- **Approvals.** HR then Accounts (no CEO step). Master data has its own gates: SALARY_STRUCTURE needs `HR_APPROVED_BY`, STATUTORY_CONFIG needs `APPROVED_BY` (§3, §4).

## 1. Populations

| Code (`PAYROLL_CATEGORY`) | Payslip | Calc |
|---|---|---|
| `STAFF` | Yes | §5.1 |
| `PERMANENT_WORKER` | Yes | §5.2 |
| `CONSULTANT` | No | §5.3 |
| `PUNE_STAFF` | No | §5.4 |

Active roster for a period = `EMPLOYEE_MASTER` rows with `STATUS_AS_SOURCE = Active` (column names, not letters) **whose DOJ is not after the period end**. `DOJ_AS_SOURCE` is read day-first (`dd/mm/yyyy`); a date whose day-first and month-first readings would give different answers (e.g. `03/10/2026` for a September run) or that cannot be parsed keeps the employee on the roster with the WARN `DOJ_AMBIGUOUS` / `DOJ_UNPARSEABLE` (blank DOJ: included, no warning). Joiners excluded by the rule are reported by `prepareMonthlyAttendance`. Salary inputs: `SALARY_STRUCTURE` (STAFF/WORKER) and `PAYROLL_RATE_PROFILE` (CONSULTANT/PUNE). Latest row per EMP_ID whose `EFFECTIVE_FROM <= period end` and (`EFFECTIVE_TO` blank or `>= period start`); for rate profile use the row per EMP_ID (single current row).

## 2. Tabs (existing = reuse; new = create in setup)

Control
- `PAYROLL_CONTROL` (existing key/value). Setup adds keys if missing: `HR_APPROVER_EMAIL=hr@varshaforgings.com`, `ACCOUNTS_APPROVER_EMAIL=accounts@varshaforgings.com`, `MIN_PERIOD=2026-09`, `PAYSLIP_TEMPLATE_STAFF_ID=1T7kwVNmOczXk4_-4OstofWOPSWGuEQxg7hKFo-Jci_w`, `PAYSLIP_TEMPLATE_WORKER_ID=1MSmi8qVRL8SI8-svVihasYbLFGNo8Xkzko4VUaIX8SU`, `PAYSLIP_FOLDER_ID=` (blank → payslip step blocked), `EMAIL_RELEASE_ENABLED=FALSE`, `NASHIK_WEEKLY_OFF=SUN`, `PUNE_WEEKLY_OFF=SUN`, `OT_SOURCE_SPREADSHEET_ID=` (blank: the OT form is linked into this spreadsheet and read from a local tab; set it only to read an external response spreadsheet, e.g. `1AssFUO5PJZLUzZCFINlqwGw9mckICIRnsYxHCmuhVkM`), `OT_SOURCE_TAB=OT_FORM_RESPONSES` (falls back to the legacy `Overtime_Form` tab if absent; with an external ID it names the tab there, default `Form Responses 1`), `OT_WINDOW_START_2026-09=2026-08-26` (note "one-time catch-up: Aug salary paid OT to 25-Aug"). Written by code later: `OT_PENDING_<period>`, `ATT_FORM_NASHIK_ID`, `ATT_FORM_PUNE_ID`. `CANTEEN_FORM_ID` / `EFFICIENCY_FORM_ID` are no longer used (one spreadsheet-level trigger, §4).
- `PAYROLL_PERIOD_CATEGORY` (existing: PAYROLL_MONTH, PAYROLL_CATEGORY, WORKING_DAYS, STATUS, APPROVED_BY, APPROVED_AT, NOTE). HR enters WORKING_DAYS per population per month. Engine owns STATUS (state machine §7). Setup appends columns: `DRAFT_RUN_ID, DRAFT_HASH, HR_APPROVED_BY, HR_APPROVED_AT, ACCOUNTS_APPROVED_BY, ACCOUNTS_APPROVED_AT, LOCKED_AT, LOCK_ID`. `prepareMonth(period)` inserts the 4 rows for a new period if absent. **Legacy `STATUS = APPROVED`** (the sheet note tells HR to set it after entering and approving the working days) is accepted and treated exactly like `PENDING` by `calculateDraft`; it is replaced by `DRAFT` on the first calculation. The legacy `APPROVED_BY` / `APPROVED_AT` columns are **never written** by the payroll approvals (only the `HR_` / `ACCOUNTS_` columns are).
- `STATUTORY_CONFIG` (existing KEY/VALUE/NOTE). Setup appends columns `EFFECTIVE_FROM, EFFECTIVE_TO, VERSION, APPROVED_BY, APPROVED_AT` (existing rows get `EFFECTIVE_FROM=2026-09`, `VERSION=1`) and adds missing keys: `PT_FEB_AMOUNT=300`, `MLWF_MONTHS=6,12`, `STAFF_OT_MULTIPLIER=2`, `WORKER_OT_MULTIPLIER=2`, `STAFF_PF_WAGE_COMPONENTS=BASIC,CONVEYANCE,EDUCATION,MEDICAL`, `STAFF_COMPONENT_PCTS={"BASIC":0.40,"HRA":0.24,"CONVEYANCE":0.06,"MEDICAL":0.06,"EDUCATION":0.06,"PRO_DEV":0.03,"COMMUNICATION":0.02,"UNIFORM":0.04,"WASHING":0.09}`, `EMPLOYER_PF_RATE_STAFF=0.1301`, `EMPLOYER_PF_RATE_WORKER=0.1301`, `BONUS_RATE_STAFF=0.0833`, `GRATUITY_RATE_STAFF=0.0483`, `BONUS_RATE_WORKER=0.18`, `GRATUITY_RATE_WORKER=0.0481`. Engine reads the version effective for the period. **Approval gate (R11 / R27):** a required key whose applicable row has a blank `APPROVED_BY` is a readiness BLOCKER; Accounts stamps `APPROVED_BY` / `APPROVED_AT` with the menu action *Approve statutory config (Accounts)* (§4).
- `PT_EXEMPTIONS` (new): EMP_ID, REASON, EFFECTIVE_FROM, EFFECTIVE_TO, APPROVED_BY. Seed: VFL4021, VFL4014, VFL4063 (reason "carried from Aug worker template R17").
- `EFFICIENCY_CONFIG` (existing slab table `EFFICIENCY_PERCENT_EXACT` / `INCENTIVE_SLAB_INR`; read-only). Its `IMPLEMENTATION_STATE` only drives an informational WARN (§3 check 11).
- `HOLIDAY_CALENDAR` (new): DATE, SITE (`NASHIK`/`PUNE`/`ALL`), HOLIDAY_NAME, PAID (Y/N).
- `FEED_STATUS` (new): PERIOD, FEED, STATUS (`OPEN`/`COMPLETE`), MARKED_BY, MARKED_AT, NOTE. Feeds: `ATTENDANCE, CANTEEN, OT, EFFICIENCY, ADVANCE, SOCIETY, ADJUSTMENTS, HOLIDAYS`. A feed with zero rows is only trusted when marked COMPLETE — distinguishes "no deductions" from "not entered yet".

Attendance
- `ATTENDANCE_DAILY` (new, controlled daily, Oct onward): PERIOD, DATE, SITE, EMP_ID, CODE, SOURCE (`FORM_NASHIK`/`FORM_PUNE`/`HR_EDIT`), SOURCE_REF (response row id), KEY (`EMP_ID|DATE`), STATUS (`VALID`/`SUPERSEDED`/`REJECTED`), REJECT_REASON, ENTERED_AT. Latest VALID row per KEY wins; earlier ones marked SUPERSEDED.
- Daily codes: `P` present, `HD` half day (0.5 present), `A` absent, `WO` weekly off, `PH` paid holiday, `EL`, `CL`, `SL`, `OD` (counts as present), `COFF` (counts as paid leave), `LWP` (unpaid).
- `INPUT_ATTENDANCE` (existing schema = the **monthly sheet HR reviews**): PAYROLL_MONTH, EMP_ID, PAYROLL_CATEGORY, WORKING_DAYS, PRESENT_DAYS, WEEK_OFF, PH, EL_AVAILED, CL_AVAILED, SL_AVAILED, PAID_LEAVE_OTHER, WORKED_DAYS, PAYABLE_DAYS, APPROVAL_STATUS, APPROVED_BY, SOURCE_REF, ENTERED_AT, REMARKS. Setup appends: `PHYSICAL_PRESENT_DAYS, ABSENT_LWP_DAYS, GENERATED_VALUES_JSON, HR_OVERRIDE (Y/N), OVERRIDE_REASON, ROW_KEY`.
  - **September (and any month without daily data):** `prepareMonthlyAttendance(period)` pre-fills one row per active employee (PAYROLL_MONTH, EMP_ID, PAYROLL_CATEGORY, WORKING_DAYS from PAYROLL_PERIOD_CATEGORY, APPROVAL_STATUS=`PENDING`, SOURCE_REF=`HR_MONTHLY_ENTRY`); HR types the day counts directly in INPUT_ATTENDANCE. The earlier Days-Worked form (UDF-1.1, `PAYROLL_DAYS_FORM_RESPONSES`) was never built and is **not** read by the code; a new monthly register replaces it in the next phase. `DAYS_WORKED_FORM_RAW`, `INPUT_DAYS_WORKED`, `PAYROLL_DAYS_EXCEPTIONS` are legacy and ignored.
  - **`WORKING_DAYS` refresh:** `prepareMonthlyAttendance` and `generateMonthlyAttendance` copy `PAYROLL_PERIOD_CATEGORY.WORKING_DAYS` into `INPUT_ATTENDANCE.WORKING_DAYS` of PENDING rows (APPROVED rows, LOCKED populations and blank category values are left alone). The engine itself always reads the category value.
  - **October onward:** `generateMonthlyAttendance(period)` aggregates ATTENDANCE_DAILY into the same rows (SOURCE_REF=`DAILY_GENERATED`, stores the generated numbers in GENERATED_VALUES_JSON). If a row already exists and differs from what HR typed, keep HR's values, set HR_OVERRIDE=Y and require OVERRIDE_REASON (readiness blocks otherwise). Never overwrite APPROVED rows; regenerate only PENDING ones.
  - Aggregation: PRESENT_DAYS = P + OD + 0.5×HD; PHYSICAL_PRESENT_DAYS = P + 0.5×HD; WEEK_OFF = WO; PH = PH; EL/CL/SL; PAID_LEAVE_OTHER = COFF; ABSENT_LWP_DAYS = A + LWP + 0.5×HD. Days in the month with no record → treated as **missing** (readiness BLOCKER listing dates), not present.
  - WORKED_DAYS (the proration numerator) = PRESENT_DAYS + WEEK_OFF + PH + EL + CL + SL + PAID_LEAVE_OTHER for STAFF, CONSULTANT, PUNE_STAFF; for PERMANENT_WORKER = PRESENT_DAYS + EL + CL + SL + PH + PAID_LEAVE_OTHER (no WO — matches Aug worker template). PAYABLE_DAYS = WORKED_DAYS. Formula-computed by engine at calc time from the entered components; the sheet cells are informational.
  - HR approves attendance by setting APPROVAL_STATUS=`APPROVED` (bulk menu action "Approve attendance for population", records APPROVED_BY = active user).
- Forms (created by code, `createAttendanceForms()`): **Daily Attendance – Nashik** (VFL + CON employees) and **Daily Attendance – Pune** (PUNE_STAFF). Questions: Date (required); one *multiple-choice grid* per department, rows = `EMP_ID – Name`, columns = the daily codes; grid rows **not required**; checkbox "All employees left blank were present (or on weekly off / holiday as per calendar)" (required). Blank → `P`, or `WO` if weekday = site weekly off, or `PH` if HOLIDAY_CALENDAR has a paid holiday for that date/site. Responses land in new tabs `ATT_FORM_NASHIK_RAW` / `ATT_FORM_PUNE_RAW` (columns `Timestamp`, `Date`, `Attendance – <Dept> [EMP_ID – Name]`, acknowledgement); the spreadsheet-level trigger (§4) reads the new row (`parseAttendanceRawRow`) → normalizer → ATTENDANCE_DAILY. Daily forms are for October onward. `refreshAttendanceFormRosters()` rebuilds grid rows from the active master (menu action; run when joiners/leavers change). Re-submitting a date supersedes the earlier submission.

Other feeds (controlled inputs; normalizers are idempotent via a KEY column and reject periods < MIN_PERIOD or LOCKED)
- `INPUT_OT` (existing; Apr–Aug rows untouched). Setup appends columns: `OT_KEY, OT_DATE, SOURCE_ROW, NORMALIZER_VERSION, ELIGIBILITY (VALID/EXCEPTION/SUPERSEDED), EXCEPTION_REASON`. `syncOtFromForm(period)`:
  - **Source:** a LOCAL tab of this spreadsheet — the OT Google Form is linked into it — named by `OT_SOURCE_TAB` (seeded `OT_FORM_RESPONSES`; if that tab is absent the legacy `Overtime_Form` tab is used). Only when `OT_SOURCE_SPREADSHEET_ID` is set (seeded blank) is the external response spreadsheet opened with `SpreadsheetApp.openById` and `OT_SOURCE_TAB` (default `Form Responses 1`) read there. Header-selective reads: `Timestamp, Submission Type, EMP ID, Date Of OT, OT Hours, Approval Decision` and `Case No` when present, one column at a time, with the password-column assertion.
  - **Window:** OT is counted by the **calendar month of the OT date**. `PAYROLL_CONTROL.OT_WINDOW_START_<YYYY-MM>` moves the start of one period's window; setup seeds `OT_WINDOW_START_2026-09 = 2026-08-26` because August salary paid OT only to 25-Aug, so September pays 2026-08-26..2026-09-30. Rows keep `PAYROLL_MONTH` = the run period.
  - **Rows:** one row per source event (A=PAYROLL_MONTH text `YYYY-MM`, B=EMP_ID, C=OT_HOURS, D=`OVERTIME_FORM`, E=APPROVED, G=case no **as text with leading apostrophe**, I=`YYYY-MM-DD..YYYY-MM-DD`, H=1). OT_KEY = `EMP_ID|OT_DATE|SOURCE_ROW`.
  - **Reversals / corrections:** events are grouped by Case No + EMP_ID + date (no Case No: EMP_ID + date). The **latest decisive row** (Approved or Rejected; newest Timestamp, then row) of a group wins: a later Rejected excludes the group (no exception, counted as `revokedByRejection`); a corrected approval takes the latest hours. Re-running a sync for a period compares the fresh result with the rows already written by the normalizer (`NORMALIZER_VERSION` set, not `HR_MANUAL`, not LOCKED population): identical rows are kept, every other one is marked `ELIGIBILITY=SUPERSEDED` by cell update (its `OT_HOURS` is set to 0 and the original hours are kept in `EXCEPTION_REASON`) and the fresh set is appended. Legacy Apr–Aug rows are never touched.
  - **Exceptions:** unknown EMP_ID, non-numeric / non-positive hours, hours > 16 in one event, unparseable date, `Approved` on a non-approval row or an unrecognised decision → `ELIGIBILITY=EXCEPTION` (excluded, listed in readiness). Exception rows write `OT_HOURS = 0` with the original hours in `EXCEPTION_REASON` (`<reason> | ORIGINAL_OT_HOURS=<h>`), so the sheet's *Monthly OT Report* SUMIFS is never inflated. Pending/unapproved events inside the window → readiness WARN with count.
  - **Payable hours** (`sumOtHours`): VALID normalizer rows (SUPERSEDED / EXCEPTION never count) **plus manual HR rows** — INPUT_OT rows with `SOURCE_REF = HR_MANUAL` (column D), `APPROVAL_STATUS = APPROVED`, period ≥ MIN_PERIOD — for employees who are not on the OT form (CON## consultants, BUNG## Pune staff).
- `INPUT_CANTEEN` (header-less today; setup writes header): PAYROLL_MONTH, EMP_ID, AMOUNT_INR, SOURCE, SOURCE_REF, KEY, STATUS, ENTERED_AT, REMARKS. Normalizer from `CANTEEN_FORM_RESPONSES` (map by header using `FORM_SPEC_CANTEEN`); HR may also type rows directly (SOURCE=`HR_MANUAL`). Latest per `PERIOD|EMP_ID` wins **including invalid ones**: if the latest response is an EXCEPTION row there is no fallback to an older valid response; the employee's canteen amount is then 0 and readiness BLOCKS (`CANTEEN_EFFICIENCY_EXCEPTIONS`) until a later valid row exists. A sync re-evaluates exceptions (fixing the master clears them) and only writes new problems.
- `INPUT_EFFICIENCY` (setup writes header): PAYROLL_MONTH, EMP_ID, EFFICIENCY_PCT, PHYSICAL_PRESENT_DAYS_OVERRIDE, SOURCE, SOURCE_REF, KEY, STATUS, ENTERED_AT, REMARKS. Normalizer from `EFFICIENCY_FORM_RESPONSES` (headers matched by name, e.g. `Production efficiency percent`, `Physical present days (optional)`, `Correction reason (required if CORRECTION)`). **Per employee only**: the `ALL_WORKERS` blanket convention is retired (sheet rule: no blanket); such a row becomes an `ALL_WORKERS_NOT_SUPPORTED` exception. The same no-fallback / readiness-BLOCKER rule as canteen applies.
- `INPUT_ADVANCE`, `INPUT_SOCIETY` (existing schemas): only rows with APPROVAL_STATUS=APPROVED count. Advance → RECOVERY_THIS_MONTH_INR (WARN `ADVANCE_RECOVERY_EXCEEDS_BALANCE` when it is greater than OPENING_BALANCE_INR; BLOCKER `ADVANCE_DUPLICATE_LEDGER_REFERENCE` when the same ACCOUNTS_LEDGER_REFERENCE appears twice for one EMP_ID and period). Society → TOTAL_RECOVERY_INR; when it is blank the sum of `GENERAL_EMI_INR + EMERGENCY_EMI_INR + EDUCATION_EMI_INR + SHARES_OTHER_INR` is used; when both are present and differ the total is used with WARN `SOCIETY_TOTAL_MISMATCH`. These flags are added to the employee's draft row (FLAGS / PAYROLL_EXCEPTIONS); a BLOCKER withholds that employee's NET_PAY.
- `INPUT_ADJUSTMENTS` (existing schema): only APPROVED rows count. `ADJUSTMENT_TYPE` enum (data validation added by setup) and side:
  - Earnings: `ARREARS`, `DISPATCH_INCENTIVE`, `OTHER_ALLOWANCE`, `LEAVE_ENCASHMENT`, `OT_EXTRA_WORK`, `PRODUCTION_INCENTIVE`
  - Deductions: `TDS`, `OTHER_DEDUCTION`, `PENALTY`, `CANTEEN_EXTRA`
  - SIGNED_AMOUNT_INR is entered positive; a negative value is a correction of the same type. A reversal row references REVERSAL_OF_ENTRY_ID.
- Leave: HR enters EL/CL/SL counts in the attendance path. The external leave sheet is **not** a payroll feed in v1.

Outputs
- `PAYROLL_DRAFT` (all populations, one row per employee per run) with the unified column set in §6. `PAYROLL_STAFF`, `PAYROLL_WORKER`, `PAYROLL_CONSULTANT` (new), `PAYROLL_PUNE_STAFF` (new): filtered views written by the engine (same columns) for HR reading.
- `PAYROLL_EXCEPTIONS`: RUN_ID, PERIOD, POPULATION, EMP_ID, SEVERITY (BLOCKER/WARN), CODE, MESSAGE.
- `PAYROLL_RECON`: PERIOD, POPULATION, HEADCOUNT, TOTAL_GROSS, TOTAL_DEDUCTIONS, TOTAL_NET, PREV_PERIOD_NET (from PAYROLL_LOCKED if any), DELTA_PCT, RUN_ID.
- `PAYROLL_READINESS` (rebuilt clean with the design header; the engine rewrites the rows of the period and population): PERIOD, POPULATION, CHECK, STATUS (READY/BLOCKED/WARN), DETAIL, CHECKED_AT.
- `PAYROLL_LOCKED` (new, append-only, protected): LOCK_ID + all §6 columns. **`PAYROLL_HISTORY` is not written** (it holds the August QA replay; leave untouched).
- `PAYSLIP_REGISTER` (new): LOCK_ID, PERIOD, EMP_ID, POPULATION, DOC_ID, PDF_ID, PDF_URL, GENERATED_AT, STATUS.
- `PAYSLIP_EMAIL_LOG` (existing, empty; setup writes header): LOCK_ID, PERIOD, EMP_ID, TO_EMAIL, PDF_ID, STATUS (QUEUED/SENT/FAILED/SKIPPED), ATTEMPTED_AT, ERROR.
- `AUDIT_LOG` (existing): append one row per state change / run (use its existing header).

## 3. Readiness checks (per period × population)

BLOCKER unless stated. Check names in `PAYROLL_READINESS.CHECK`: `PERIOD_WORKING_DAYS, ATTENDANCE_COVERAGE, ATTENDANCE_APPROVED_VALID, DAILY_ATTENDANCE_COMPLETE, SALARY_PRESENT_NONZERO, FEEDS_COMPLETE, OT_EXCEPTIONS, STATUTORY_CONFIG, DUPLICATE_MASTER_IDS, CONSULTANT_MONTHLY_OT, EFFICIENCY_CONFIG_CONFIRMED, NEGATIVE_NET_PAY, PAY_STRUCTURE_APPROVED, CANTEEN_EFFICIENCY_EXCEPTIONS` (+ `CALC_BLOCKERS` when a draft was calculated).
1. PAYROLL_PERIOD_CATEGORY row exists and WORKING_DAYS is a positive number ≤ days in month.
2. Every active employee (DOJ not after the period end) has exactly one INPUT_ATTENDANCE row; no rows for unknown/inactive EMP_IDs; no duplicate EMP_ID.
3. Every attendance row APPROVED; WORKED_DAYS ≤ days in month; for PERMANENT_WORKER WORKED_DAYS ≤ WORKING_DAYS (else WARN for others); numeric non-negative fields; HR_OVERRIDE=Y requires OVERRIDE_REASON.
4. If daily data exists for the period: no missing dates per employee (dates before DOJ excluded).
5. Salary structure / rate profile present with non-zero pay for every active employee (zero → BLOCKER naming EMP_ID; e.g. VFL1001 has all-zero structure).
6. Feeds CANTEEN, OT, ADVANCE, SOCIETY, ADJUSTMENTS marked COMPLETE in FEED_STATUS; EFFICIENCY COMPLETE for PERMANENT_WORKER.
7. No OT EXCEPTION rows for the population; pending OT → WARN.
8. Statutory keys required for the population exist with a version effective for the period **and are approved** (`APPROVED_BY` not blank on the applicable row; sheet rules R11 / R27).
9. Duplicate EMP_ID in master among actives → BLOCKER (no active duplicates exist today; VFL1542 has two Non-Active rows only).
10. CONSULTANT with PAY_BASIS monthly and OT_HOURS > 0 → BLOCKER (OT_METHOD BLOCK_NONZERO_OT_UNTIL_ACCOUNTS_CONFIRM).
11. EFFICIENCY_CONFIG IMPLEMENTATION_STATE ≠ CONFIRMED → WARN on PERMANENT_WORKER (informational; the payment rule itself is confirmed by the owner, set the state to CONFIRMED to clear the WARN).
12. Negative net pay → BLOCKER for that employee.
13. **PAY_STRUCTURE_APPROVED** (PROCESS_FLOW 1.0): the effective SALARY_STRUCTURE row of every STAFF / PERMANENT_WORKER must have `HR_APPROVED_BY`; CONSULTANT / PUNE_STAFF rate profiles need an approved `VERSION_STATE` (blank = no gate, `…UNAPPROVED` blocks). `USER_APPROVED_JULY_PROXY` counts as approved but gives WARN `PROXY_RATE_JUL2026` (R28), also added to those employees' FLAGS.
14. **CANTEEN_EFFICIENCY_EXCEPTIONS**: any canteen / efficiency row whose latest response for an employee is an EXCEPTION blocks the owning population (unknown EMP_IDs block all populations for canteen and the worker population for efficiency).

## 4. Menu (onOpen → "HR OS")

Setup ▸ Run setup (idempotent) · Create attendance forms · Refresh form rosters · Install triggers
Month ▸ Prepare month… (asks PERIOD) · Prepare monthly attendance (HR entry) · Generate monthly attendance from daily · Approve attendance (population) · Sync OT · Sync canteen · Sync efficiency · Mark feed complete…
Payroll ▸ **Approve salary structure (HR)…** · **Approve statutory config (Accounts)…** · Check readiness · Calculate draft · HR approve (population) · Accounts approve (population) · Lock period (population) · Reopen (owner only, before lock)
Payslips ▸ Generate payslips (locked only) · Queue emails · Send queued emails (requires EMAIL_RELEASE_ENABLED=TRUE for the period and ACCOUNTS approver running it)

**Approve salary structure (HR)** (period + STAFF / PERMANENT_WORKER): shows the counts (active employees, effective rows, rows to stamp, already approved, employees without a structure), asks for confirmation, then — only when the runner is `HR_APPROVER_EMAIL` — stamps `HR_APPROVED_BY` / `HR_APPROVED_AT` on the SALARY_STRUCTURE rows **effective for that period** of that population's active employees (a future-dated version is not approved by accident). **Approve statutory config (Accounts)** (period): same pattern for the STATUTORY_CONFIG rows applying to the period; runner must be `ACCOUNTS_APPROVER_EMAIL`; stamps `APPROVED_BY` / `APPROVED_AT`. Both are audited (`SALARY_APPROVE`, `STATUTORY_APPROVE`) and idempotent.

**Triggers (≤ 5 in the project, never deleting unknown ones):** onOpen (simple) and **one** installable spreadsheet-level trigger `hrosOnFormSubmit` = `ScriptApp.newTrigger('hrosOnFormSubmit').forSpreadsheet(ss).onFormSubmit()`. It routes by the name of the sheet the response landed in (`e.range.getSheet().getName()`): `ATT_FORM_NASHIK_RAW` / `ATT_FORM_PUNE_RAW` → daily attendance ingest, the OT source tab (`OT_FORM_RESPONSES`, or the local tab in use) → `syncOtFromForm` for the period of that row's OT date (calendar month; 26–31 Aug belong to September while the catch-up override is set; dates before MIN_PERIOD are skipped), `CANTEEN_FORM_RESPONSES` → `syncCanteenFromForm`, `EFFICIENCY_FORM_RESPONSES` → `syncEfficiencyFromForm`; every other tab is ignored. `installTriggers()` is idempotent, needs no form IDs and replaces the former per-form triggers. The menu items *Sync OT / canteen / efficiency* remain for manual runs.

## 5. Calculation (pure functions in `Calc.gs`)

Notation: `wd` = WORKING_DAYS for population/period (HR-entered). `w` = WORKED_DAYS. `pp` = PHYSICAL_PRESENT_DAYS. Month name from period. `round(x)` = round half away from zero to integer (match Sheets ROUND).

### 5.1 STAFF
- Fixed components from SALARY_STRUCTURE (`BASIC_PM_INR` … `WASHING_PM_INR`), fixed gross `FG = FIXED_GROSS_PM_AS_SOURCE_INR`.
- `GROSS = FG × w / wd` (unrounded). Earned components = `round(GROSS × pct)` per STAFF_COMPONENT_PCTS.
- `OT_AMOUNT = (BASIC_PM / wd / 8) × STAFF_OT_MULTIPLIER × ot_hours`.
- PF wage = earned BASIC + CONVEYANCE + EDUCATION + MEDICAL; `PF = wage ≤ PF_WAGE_CEILING ? wage × PF_EMPLOYEE_RATE : PF_MAX_EMPLOYEE`.
- `ESI = FG ≤ ESI_EXEMPT_ABOVE ? round(FG × ESI_EMPLOYEE_RATE / wd × w) : 0`.
- `PT` = 0 if GROSS = 0 or EMP_ID in PT_EXEMPTIONS; month Feb → PT_FEB_AMOUNT; else slab on **own** GROSS from PT_SLABS (fixes R16 misaligned range).
- MLWF = MLWF_EMPLOYEE_RATE if month ∈ MLWF_MONTHS else 0.
- Deductions = PF + ESI + PT + CANTEEN + SOCIETY + ADVANCE + TDS + MLWF + OTHER_DEDUCTION(+PENALTY+CANTEEN_EXTRA).
- `NET = round(GROSS − deductions + ARREARS + OT_AMOUNT + DISPATCH + OTHER_ALLOWANCE (+LEAVE_ENCASHMENT+PRODUCTION_INCENTIVE+OT_EXTRA_WORK))`.
- Employer (info): EMPLOYER_PF same cap rule at EMPLOYER_PF_RATE_STAFF; EMPLOYER_ESI = FG ≤ limit ? round(FG × ESI_EMPLOYER_RATE / wd × w) : 0; BONUS = round(earned BASIC × BONUS_RATE_STAFF); GRATUITY = round(earned BASIC × GRATUITY_RATE_STAFF).
- Acceptance: FG 31,500, wd 31, w 31, Society 100, Other 1,000 → PF 1,800, ESI 0, PT 200, NET 28,400; bonus 1,050, gratuity 609.

### 5.2 PERMANENT_WORKER
- Earned BASIC, HRA, CONVEYANCE, WASHING, EDUCATION = `round(master / wd × w)`.
- HEAT = HEAT_MASTER_INR = 150 ? round(w × WORKER_HEAT_RATE) : 0.
- VDA = round(WORKER_VDA_RATE × pp)  (physical present days, not worked). `pp` = INPUT_ATTENDANCE.PHYSICAL_PRESENT_DAYS; when blank the efficiency-form `PHYSICAL_PRESENT_DAYS_OVERRIDE` (per employee, WARN `PHYSICAL_DAYS_FROM_EFFICIENCY_FORM`) and otherwise PRESENT_DAYS (as in August). Never a blocker.
- **Production (efficiency) pay** is an earning equal to the slab amount for `floor(efficiency %)` from EFFICIENCY_CONFIG: `< 81` → 0; `81..85` → 4,500 / 5,000 / 6,500 / 7,500 / 8,500; `> 85` → the 85 slab (8,500). Not prorated. `PRODUCTION_ALLOWANCE = EFFICIENCY_ELIGIBLE_AMOUNT = slab`, `EFFICIENCY_DEDUCTION = 0` always (there is **no deduction**; the payslip token `PRODUCTION_ALLOWANCE_OFFSET` prints 0). % per employee from INPUT_EFFICIENCY only (no blanket row). No % submitted → `PRODUCTION_ALLOWANCE = 0` and WARN `EFFICIENCY_NOT_SUBMITTED` (not a blocker); % outside 0..100 or an empty EFFICIENCY_CONFIG → BLOCKER. The former `EFFICIENCY_RULE_UNCONFIRMED` warning is gone (rule confirmed by the owner).
- `OT_AMOUNT = ((BASIC_PM + VDA_MASTER_INR) / wd / 8) × WORKER_OT_MULTIPLIER × ot_hours`.
- TOTAL_EARNINGS = round(BASIC+HRA+CONV+WASH+EDU + HEAT + VDA + PRODUCTION + OT_AMOUNT + DISPATCH + OTHER_ALLOWANCE + LEAVE_ENCASHMENT + ARREARS (+PRODUCTION_INCENTIVE+OT_EXTRA_WORK)).
- PF wage = earned BASIC + VDA; same PF rule (rounded).
- ESI = FG ≤ ESI_EXEMPT_ABOVE ? round(FG × ESI_EMPLOYEE_RATE / wd × w) : 0, where FG = FIXED_GROSS_PM_AS_SOURCE_INR; flag `WORKER_ESI_BASIS_UNCONFIRMED` whenever ESI > 0.
- PT on TOTAL_EARNINGS with same rules/exemptions. MLWF as staff.
- Deductions = PF + ESI + PT + CANTEEN + SOCIETY + ADVANCE + MLWF + TDS + OTHER_DEDUCTION(+PENALTY+CANTEEN_EXTRA). NET = round(TOTAL_EARNINGS − deductions).
- Employer: PF at EMPLOYER_PF_RATE_WORKER on same wage/cap; BONUS = round((BASIC+VDA) × BONUS_RATE_WORKER); GRATUITY = round((BASIC+VDA) × GRATUITY_RATE_WORKER).
- Acceptance: pp 25, w 27, wd 27, heat flag 150, OT 98.5h, Society 4,780, Advance 1,500, efficiency 80% (slab 0) → HEAT 156, VDA 2,575, production 0, deduction 0; **TOTAL_EARNINGS 48,738, deductions 8,280 (PF 1,800 + PT 200 + 4,780 + 1,500), NET 40,458**. At 90% the slab pays 8,500 as an earning (NET 48,958). (The former figures, earnings 57,238 with an 8,500 offset deduction, gave the same net.)

### 5.3 CONSULTANT
- PAY_BASIS `DAILY_RATE`: GROSS = RATE_AMOUNT_INR × w. OT = RATE / 8 × ot_hours.
- `MONTHLY_GROSS_PRORATED`: GROSS = MONTHLY_GROSS_INR × w / wd. OT must be 0 (else BLOCKER).
- Deductions = CANTEEN + SOCIETY + ADVANCE + OTHER_DEDUCTION(+PENALTY+CANTEEN_EXTRA+TDS). No PF/ESI/PT/MLWF.
- NET = round(GROSS − deductions + OT + OTHER_ALLOWANCE + PRODUCTION_INCENTIVE + OT_EXTRA_WORK + ARREARS).
- Acceptance: daily 700 × 12 = 8,400; OT 700/8 × 53 = 4,637.5; monthly 20,000 × 19/30 = 12,666.67.

### 5.4 PUNE_STAFF
- GROSS = MONTHLY_GROSS_INR × w / wd. OT = MONTHLY_GROSS_INR / wd / 8 × ot_hours. Deductions/NET as consultant. Negative NET → BLOCKER.

## 6. Unified output columns (PAYROLL_DRAFT / population tabs / PAYROLL_LOCKED)

RUN_ID, PERIOD, POPULATION, EMP_ID, EMPLOYEE_NAME, DEPARTMENT, DESIGNATION, WORKING_DAYS, PRESENT_DAYS, PHYSICAL_PRESENT_DAYS, WO_DAYS, PH_DAYS, EL, CL, SL, PAID_LEAVE_OTHER, ABSENT_LWP_DAYS, WORKED_PAYABLE_DAYS, FIXED_GROSS, PAY_BASIS, RATE, BASIC, HRA, CONVEYANCE, EDUCATION, MEDICAL, PRO_DEV, COMMUNICATION, UNIFORM, WASHING, HEAT, VDA, PRODUCTION_ALLOWANCE, GROSS_EARNINGS, OT_HOURS, OT_AMOUNT, ARREARS, DISPATCH_INCENTIVE, OTHER_ALLOWANCE, LEAVE_ENCASHMENT, PRODUCTION_INCENTIVE, OT_EXTRA_WORK, TOTAL_EARNINGS, PF_EMPLOYEE, ESI_EMPLOYEE, PT, MLWF, CANTEEN, SOCIETY, ADVANCE, TDS, EFFICIENCY_PCT, EFFICIENCY_ELIGIBLE_AMOUNT, EFFICIENCY_DEDUCTION, OTHER_DEDUCTION, TOTAL_DEDUCTIONS, NET_PAY, EMPLOYER_PF, EMPLOYER_ESI, BONUS_PROVISION, GRATUITY_PROVISION, FLAGS, CALC_VERSION, CALCULATED_AT.

`GROSS_EARNINGS` = prorated gross before OT/extras (staff: GROSS; worker: AP-equivalent BASIC+HRA+CONV+WASH+EDU; consultant/pune: GROSS). `TOTAL_EARNINGS` = everything paid before deductions.

## 7. State machine (PAYROLL_PERIOD_CATEGORY.STATUS per period × population)

`PENDING` → (calculate draft) `DRAFT` → (HR approve; readiness all READY/WARN; user = HR_APPROVER_EMAIL) `HR_APPROVED` → (Accounts approve; user = ACCOUNTS_APPROVER_EMAIL; DRAFT_HASH recomputed from current inputs+outputs must match) `ACCOUNTS_APPROVED` → (lock) `LOCKED`.
- Recalculating or any input change detected (hash mismatch) while `HR_APPROVED`/`ACCOUNTS_APPROVED` → back to `DRAFT` with AUDIT_LOG entry.
- DRAFT_HASH = SHA-256 over the sorted draft rows (excluding RUN_ID/CALCULATED_AT) for that population.
- Lock: copy that population's draft rows to PAYROLL_LOCKED with LOCK_ID = `LOCK-<PERIOD>-<POP>-<yyyyMMddHHmm>`; protect PAYROLL_LOCKED (owner-only edit); normalizers and prepare/generate functions refuse LOCKED period×population. No unlock function in v1 (corrections go to next month via INPUT_ADJUSTMENTS ARREARS/OTHER_DEDUCTION).

## 8. Payslips (STAFF, PERMANENT_WORKER only)

- Source: PAYROLL_LOCKED rows for a LOCK_ID only.
- Copy the population template Doc into PAYSLIP_FOLDER_ID/`<PERIOD>/`, replace tokens (token names as found in the template docs; map from §6 columns; NET_PAY_WORDS via Indian-numbering words function), export PDF, trash the temporary Doc copy, record in PAYSLIP_REGISTER. Idempotent: skip EMP_ID already GENERATED for that LOCK_ID.
- Sensitive tokens (`UAN, ESI_NO, PAN, BANK_NAME, BANK_ACCOUNT` / `ACCOUNT_NO, IFSC`) are printed. They are read at generation time only, for the batch being generated, from the hidden `RAW_STAFF_MASTER` (STAFF) / `RAW_WORKER_MASTER` (PERMANENT_WORKER): the header is split over row 2 (`Bank Name, IFSC, Account No., UAN, PAN, ESI No.`) and row 4 (`EMP CODE`, ...), data starts on row 5; columns are mapped by header name, employees matched on `EMP CODE`, and only the EMP CODE and identity columns are read (never mobile / Aadhaar / address). An employee with no row there gets blank tokens (not a failure). The values exist only in memory and in the generated PDF; they are never written to any tab, PAYSLIP_REGISTER, AUDIT_LOG or log (the audit summary carries counts only). The temporary Doc copy is trashed. Leave-balance tokens (`EL_AVAILABLE, CL_AVAILABLE, SL_AVAILABLE`) stay blank.
- `PRODUCTION_ALLOWANCE` prints the slab amount paid; `PRODUCTION_ALLOWANCE_OFFSET` is mapped and always 0.
- Resumable batches of 25 per execution (6-minute limit); continuation via time-based one-off trigger deleted after completion.
- Email: queue writes QUEUED rows (TO_EMAIL from EMPLOYEE_MASTER.EMAIL_ID; blank → SKIPPED). Sending requires EMAIL_RELEASE_ENABLED=TRUE **and** the runner is ACCOUNTS_APPROVER_EMAIL; default off.

## 9. Code layout (`apps-script/`)

`appsscript.json`, `00_Config.gs` (tab names, constants, period helpers), `01_SheetUtil.gs` (header-mapped read/write, append, protection helpers — the only file touching SpreadsheetApp besides entry points), `02_Setup.gs`, `10_Attendance.gs` (+ `AttendancePure` functions), `11_AttendanceForms.gs`, `20_Feeds.gs` (OT, canteen, efficiency normalizers; pure mappers separated), `30_Calc.gs` (pure), `31_Readiness.gs` (pure checks + writer), `32_Engine.gs` (orchestration), `40_Approval.gs`, `41_Lock.gs`, `50_Payslips.gs`, `51_Email.gs`, `90_Menu.gs`, `99_Audit.gs`. Cross-file helpers used at run time: `50_Payslips.gs` uses the `feeds_*` header helpers of `20_Feeds.gs`; `32_Engine.gs` and `40_Approval.gs` use `dojRosterDecision` (10) and `calc_statutoryWinners_` (30); the form-submit router lives in `11_AttendanceForms.gs`.
Pure functions take plain objects/arrays and return plain objects — Node tests load `.gs` files via `vm` into one context (`tests/load.js`).

## 10. Stage map

| Stage | Scope | Files |
|---|---|---|
| 1 | Setup + attendance (Sept monthly entry, Oct daily forms, monthly generation, HR review/approve), holiday calendar, feed status | 00,01,02,10,11,90,99 |
| 2 | OT normalizer into INPUT_OT | 20 |
| 3 | Canteen, efficiency normalizers; advance/society/adjustment readers | 20 |
| 4 | Readiness | 31 |
| 5 | Calc + engine + outputs | 30,32 |
| 6 | Approvals | 40 |
| 7 | Lock | 41 |
| 8 | Payslips + email queue | 50,51 |
