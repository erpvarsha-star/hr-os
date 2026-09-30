# VFL HR OS — Monthly Payroll

> **New to this? Follow [DEPLOY_STEPS.md](DEPLOY_STEPS.md)** - the plain-English, step-by-step deploy guide for the owner.

## Clean rebuild (the deploy procedure)

The live sheet is rebuilt clean: only the Google-Form response tabs are kept, everything else comes from one import workbook.

1. **Keep** the Google-Form response tabs (canteen, efficiency, OT; the attendance daily-form tabs are created by the code). **Delete every other tab.**
2. Generate the import workbook (it contains statutory IDs: never commit or share it; `*.xlsx` is git-ignored):
   `python3 scripts/make-import-workbook.py <old VFL_HR_OS workbook.xlsx> HR_OS_IMPORT.xlsx` (prints counts only).
3. **File ▸ Import ▸ Upload** the workbook ▸ **Insert new sheet(s)**. Tabs: PAYROLL_CONTROL, PAYROLL_CATEGORY_CONFIG, PAYROLL_PERIOD_CATEGORY, STATUTORY_CONFIG, EFFICIENCY_CONFIG, PT_EXEMPTIONS, HOLIDAY_CALENDAR, EMPLOYEE_MASTER, SALARY_STRUCTURE, PAYROLL_RATE_PROFILE, EMPLOYEE_STATUTORY_IDS and the empty INPUT_* tabs.
4. **Extensions ▸ Apps Script**: delete every old script file and every old trigger (Triggers ▸ delete). Paste [`deploy/HR_OS.gs`](deploy/HR_OS.gs) as the only file and replace `appsscript.json` (Project Settings ▸ show manifest) with [`deploy/appsscript.json`](deploy/appsscript.json).
5. Reload the sheet ▸ **HR OS ▸ Setup ▸ Run setup** (authorize). It creates every missing tab with exact headers and validations, hides + protects `EMPLOYEE_STATUTORY_IDS` and `PAYROLL_LOCKED`, and puts the tabs in order (Control, Config, Masters, Monthly inputs, Attendance, Payroll, Payslips, Audit). Then **Install triggers**.
6. **PAYROLL_CONTROL**: set `PAYSLIP_FOLDER_ID`; make sure the OT form is linked into this sheet as tab `OT_FORM_RESPONSES`; give the account that runs HR OS **view access** to the leave spreadsheet.
7. **One-time sign-offs** (each by the named login): HR approves the salary structure **per category** (Payroll ▸ Approve salary structure, period 2026-09, once for each category), Accounts approves the statutory config, the **owner approves the category config** (Payroll ▸ Approve category config).
8. Continue with the monthly runbook below.

The detailed guide follows.

# HR OS - Monthly Payroll (deployment guide and HR runbook)

Written for the business owner and the HR / Accounts team. No programming knowledge is needed to follow it.
The technical design is in `DESIGN.md`; you do not need to read it to run payroll.

## 1. What this is

HR OS is a set of small programs (Google Apps Script) that live inside your **HR OS Google Sheet**
(sheet ID `10-OpV86Gvi_TlBPQ6zKQC6y7MLWqietELGU3G06exIM`). Once installed you get an **HR OS** menu at the top of the sheet.
Each month it:

1. collects the month's numbers (working days, days worked, overtime, canteen, advances, adjustments),
2. checks that nothing is missing (the **PAYROLL_READINESS** tab),
3. calculates a **draft** payroll for four groups: STAFF, PERMANENT_WORKER, CONSULTANT, PUNE_STAFF,
4. needs **HR approval**, then **Accounts approval**, then a **lock** (after the lock nothing can change),
5. makes PDF payslips for STAFF and PERMANENT_WORKER only, and emails them once Accounts releases them.

Rules it never breaks:

- **Nothing before September 2026** is ever read or written by the new system. August and older rows stay exactly as they are.
- It **adds** tabs, columns and rows. It never deletes or renames anything. `PAYROLL_HISTORY` (the August QA replay) is never touched.
- It **never guesses**. Working days and days worked are typed by HR. If something is missing the month shows **BLOCKED** instead of a guess.
- Aadhaar numbers, phone numbers and passwords are never read. The OT form's password columns are never read. The only sensitive data used is the payslip identity block (UAN, ESI number, PAN, bank name / account / IFSC): it is read at the moment a payslip is generated, from the hidden `EMPLOYEE_STATUTORY_IDS` tab only, and is never written to any tab or to AUDIT_LOG.

## 2. Files in the `apps-script/` folder

Every file below must be created in the Apps Script project with the **same name** (Apps Script adds `.gs` itself).

| File | What it does |
|---|---|
| `appsscript.json` | Project settings and the permissions the program asks for. |
| `00_Config.gs` | Tab names, constants, month helpers, reading PAYROLL_CONTROL. |
| `01_SheetUtil.gs` | Safe reading and writing of sheet tabs (never clears or deletes). |
| `02_Setup.gs` | "Run setup", "Prepare month", "Mark feed complete". |
| `10_Attendance.gs` | Monthly attendance rows, daily-to-monthly summary, attendance approval. |
| `12_Register.gs` | The monthly attendance register: one number per employee, everything else derived (week-off, holidays, leave). |
| `13_RegisterPage.gs` | The register web page (opened from the menu as a dialog). |
| `11_AttendanceForms.gs` | Creates the two daily attendance Google Forms (October onward) and holds the single form-submit trigger that feeds attendance, OT, canteen and efficiency into the sheet. |
| `20_Feeds.gs` | Overtime, canteen and efficiency imports; advance and society readers and their checks. |
| `21_Leave.gs` | Leave sync from the separate leave spreadsheet (INPUT_LEAVE) and the leave balances printed on payslips. |
| `30_Calc.gs` | The pay calculation itself (STAFF, WORKER, CONSULTANT, PUNE). |
| `31_Readiness.gs` | The readiness checks written to PAYROLL_READINESS. |
| `32_Engine.gs` | Runs the calculation and writes the draft tabs. |
| `33_Comparison.gs` | Daily-form vs register comparison and the HR + owner dispute decisions. |
| `40_Approval.gs` | HR approve, Accounts approve, owner reopen; approval of the salary structure (HR) and of the statutory config (Accounts). |
| `41_Lock.gs` | Lock: copies the approved draft into PAYROLL_LOCKED. |
| `50_Payslips.gs` | Builds payslip PDFs from the two template Google Docs. |
| `51_Email.gs` | Queues and sends payslip emails (only when released). |
| `90_Menu.gs` | The HR OS menu. |
| `99_Audit.gs` | Writes every action to AUDIT_LOG. |

## 3. How to deploy (one time)

Follow **Clean rebuild** at the top of this file (delete old tabs / scripts / triggers, import the workbook, paste the two files, run setup). Maintainers may use `clasp` instead of pasting: `npm i -g @google/clasp`, `clasp login`, `clasp clone <SCRIPT_ID>`, copy `apps-script/` in, `clasp push`; the same authorization step applies.

## 4. Before the very first run (pre-flight)

1. **Back up the old sheet** (File ▸ Make a copy) before deleting anything.
2. **Old triggers and scripts are deleted** in the rebuild (step 4 above). HR OS installs exactly one trigger of its own (plus a short-lived one while a large payslip batch runs) and never deletes triggers it did not create.
3. **Create a private Drive folder** for payslips (only you and Accounts should have access). Copy its ID (the long text after `/folders/` in the browser address).
4. After setup (section 5) open the **PAYROLL_CONTROL** tab and fill in:

| KEY | What to put |
|---|---|
| `PAYSLIP_FOLDER_ID` | The private payslip folder ID. Blank means payslips are blocked. |
| `OT_SOURCE_TAB` | Setup writes `OT_FORM_RESPONSES`: the tab the OT Google Form is linked into (in this sheet). If that tab does not exist the old `Overtime_Form` tab is used. |
| `OT_SOURCE_SPREADSHEET_ID` | Setup leaves it **blank** (OT is read from the local tab above). Fill it only if the OT responses live in another spreadsheet; then `OT_SOURCE_TAB` must name the tab there (for example `Form Responses 1`). |
| `OT_WINDOW_START_2026-09` | Setup writes `2026-08-26` (see "OT window" below). Leave it. |
| `LEAVE_WINDOW_START_2026-09` | Setup writes `2026-08-26`: one-time catch-up because August payroll counted leave only to 25-Aug, so September counts leave from 26-Aug. From October the leave month is the calendar month. Leave it. |
| `LEAVE_SOURCE_SPREADSHEET_ID` / `LEAVE_SOURCE_TAB` | Setup writes the VFL Leave Application 2026 spreadsheet ID and the tab `Leave_Applications`. **Share that spreadsheet (view access is enough) with the Google account that runs HR OS**, otherwise every leave sync fails and the month shows BLOCKED (`LEAVE_SOURCE_UNREACHABLE`). HR OS only reads it. |
| `OWNER_APPROVER_EMAIL` | Setup writes `yash.munot@gmail.com` (note: confirm owner email). Only this login can approve attendance disputes. **Check it.** |
| `REGISTER_ENTRY_EMAILS` | Optional, comma separated: extra people allowed to submit the monthly attendance register (HR approver and owner always may). |

   Also check `HR_APPROVER_EMAIL` (default `hr@varshaforgings.com`) and `ACCOUNTS_APPROVER_EMAIL` (default `accounts@varshaforgings.com`). Approvals only work when the person is logged in as exactly these accounts.
5. Make sure the sheet has current data in: **EMPLOYEE_MASTER**, **SALARY_STRUCTURE** (STAFF and workers, with an EFFECTIVE_FROM date), **PAYROLL_RATE_PROFILE** (consultants and Pune), **STATUTORY_CONFIG**, **EFFICIENCY_CONFIG**.

## 5. First run

1. **HR OS ▸ Setup ▸ Run setup (idempotent)**. It creates the missing tabs and columns and fills default settings. Safe to run again: the second run changes nothing.
2. **HR OS ▸ Setup ▸ Create attendance forms** - needed from **October** (daily forms). Not needed for September. It creates *Daily Attendance - VFL Waluj* and *Daily Attendance - Pune* and stores their IDs in PAYROLL_CONTROL.
3. **HR OS ▸ Setup ▸ Install triggers** - installs **one** trigger for the whole sheet. From then on every answer that lands in `ATT_FORM_VFL_RAW`, `ATT_FORM_PUNE_RAW`, the OT tab (`OT_FORM_RESPONSES`), `CANTEEN_FORM_RESPONSES` or `EFFICIENCY_FORM_RESPONSES` is processed automatically (any other tab is ignored). No form IDs are needed. It can be run again safely (it never adds a second one and never touches other triggers; a project can hold at most 5).
4. Do the PAYROLL_CONTROL entries from section 4.
5. **Approve the master data once** (needed before any payroll can be approved): **Approve salary structure (HR)...** for every category (it lists the pending rows), **Approve statutory config (Accounts)...** and, by the owner, **Approve category config...**. Until this is done, readiness shows BLOCKED (`PAY_STRUCTURE_APPROVED` when no row of the population is approved yet, `STATUTORY_CONFIG`, `CATEGORY_CONFIG`). Later additions (new joiners, salary revisions) only put that employee on HOLD `SALARY_NOT_APPROVED` until HR approves the new row.

## 6. Monthly runbook

Who does what: **HR** prepares and approves attendance, feeds and the first approval. **Accounts** gives the second approval, locks and releases emails. The **owner** only steps in for reopen, triggers and access.

The menu asks you to type the month as `YYYY-MM` (for example `2026-09`) and, where needed, the group exactly as `STAFF`, `PERMANENT_WORKER`, `CONSULTANT` or `PUNE_STAFF`.

### Step A - Prepare the month (HR)

1. **HR OS ▸ Month ▸ Prepare month...** - creates the four group rows in PAYROLL_PERIOD_CATEGORY and the nine feed rows in FEED_STATUS (all OPEN).
2. In **PAYROLL_PERIOD_CATEGORY** type **WORKING_DAYS** for each of the four groups of that month (a positive number, not more than the days in the month).
3. Add public holidays to **HOLIDAY_CALENDAR** if any (DATE, SITE = VFL / PUNE / ALL, HOLIDAY_NAME, PAID = Y/N).

### Step B - Attendance (HR)

**Monthly attendance register (September onward) - replaces typing into INPUT_ATTENDANCE:**

1. **HR OS ▸ Month ▸ Open monthly attendance register.** A window opens. Pick the month (it proposes the latest open one).
2. At the top, for each group choose **Days present EXCLUDES weekly offs** (default) or **INCLUDES weekly offs**, according to how the days were counted for that group. Workers have no week-off component: the choice is ignored for them (with a warning).
3. Type **one number per employee** (0 to the days of the month, halves allowed). Leave a row blank if it is not entered yet. **Submit register.** Only PENDING rows are written; approved or locked rows are skipped and listed.
4. Everything else is filled in for you: WEEK_OFF (weekly-off weekdays of the month, minus days that are paid holidays), PH (paid holidays of HOLIDAY_CALENDAR that are not on the weekly off), EL / CL / SL / C-Off / LWP from the approved leave, and OD days (added to present days but not to the physical days that drive VDA). If present + week-off + holidays + paid leave is **more than the days in the month**, that employee is put on **HOLD** (`ATTENDANCE_OVER_MONTH`) until the numbers are corrected.
5. **Month ▸ Sync leave** (see "Leave" below) whenever leave changes: the register rows are recalculated with the new leave. You can submit the register again at any time before approval.
6. **Month ▸ Approve attendance (population)...** once per group.

Employees who left during the month stay on the register if the master has a last working day (column `LAST_WORKING_DAY`) on or after the first of the month.

**October onward = daily forms plus the register:**

1. Supervisors fill the daily VFL Waluj (plant) and Pune forms each day (mark only exceptions; blanks count as present, weekly off or paid holiday). Sending the same date again replaces the earlier answer. HR still submits the monthly register: it is what is paid.
2. At month end: **Month ▸ Build daily vs register comparison**. Each employee gets a row in **ATTENDANCE_COMPARISON**: `DAILY_PRESENT` (from the forms: present + half of half days; OD not counted) against `REGISTER_PRESENT` (the physical days of the register). Equal = `MATCH` and the employee is paid normally. Different = `DISPUTE`: **that employee alone is on HOLD** (the rest of the group is not blocked).
3. To settle a dispute: HR types `HR_DECIDED_DAYS` and `HR_REASON` in ATTENDANCE_COMPARISON, then runs **Month ▸ Submit dispute decisions** (logged in as the HR approver). Then the owner runs **Month ▸ Owner: approve attendance disputes** (logged in as `OWNER_APPROVER_EMAIL`; shows the list and asks for a YES). The decided days replace the employee's present / physical days in INPUT_ATTENDANCE (the row shows HR_OVERRIDE = Y and the reason). Then approve attendance again and calculate. If the owner rejects (type `REJECTED` in OWNER_DECISION, or use the reject action), the employee stays on hold.
   - Do the disputes **before** approving attendance for that group, or set the employee's INPUT_ATTENDANCE row back to PENDING; approved rows are never overwritten. Approve attendance leaves employees with an open dispute PENDING on its own.
   - If HR changes the decided days after submitting them, submit again (an earlier owner decision is then cleared and the owner must decide again). Typing OWNER_DECISION by hand does not release anyone: only the owner's menu action does.
4. Employees without a register row are paid from **Generate monthly attendance from daily** as before (missing dates block them).

**Legacy:** *Prepare monthly attendance (HR entry)* still exists and pre-fills PENDING rows, but the register overwrites them.

#### Leave (separate leave spreadsheet)

The leave application form has its own spreadsheet, its own approval process and yearly balances. HR OS only **reads** it (never writes, never reads the password column).

- **Month ▸ Sync leave** reads the approved leave that touches the month into **INPUT_LEAVE** (one row per approved leave, days inside the month only; the leave month is the **calendar month**, not the leave sheet's 26th-25th cycle - except the one-time September catch-up window from 26-Aug; leave over two months is split by date; Rejected after Approved cancels it). An approval is linked to its application only by employee + start date + end date + leave type (the Case No is just shown, it is shared by different leaves). **Approved Number of days** is used as the sheet counts it - calendar days including weekly offs and holidays, spread evenly over the dates of the leave - and the half-day options are only used when that number is blank (start "Second Half" and end "First Half" are half days). A row that already says Approved on the application row itself counts too. It also runs automatically at the start of **Calculate draft**.
- Rows that cannot be counted are written as `EXCEPTION` with the reason (unknown employee or leave type, end before start, invalid dates or approved days, duplicate / overlapping leave). They put that employee on HOLD; fix the leave in the leave spreadsheet and sync again. Old bad rows of other months never block a new month.
- If the leave spreadsheet cannot be opened, Sync leave says so (give the account that runs HR OS view access). During **Calculate draft** the failure marks the LEAVE feed OPEN and shows `LEAVE_SOURCE_UNREACHABLE` for every group; it clears with the next successful sync. Then mark the **LEAVE** feed complete.
- After attendance is approved, later leave changes are **not** pushed into approved rows: the sync result lists them (`registerStaleApproved`); set those rows back to PENDING and submit the register again.

### Step C - Other feeds (HR)

| Feed | How the data gets in |
|---|---|
| OT | Answers of the OT form arrive in the sheet by themselves (trigger); **Month ▸ Sync OT** re-reads the whole month at any time. See "Overtime (OT)" below. |
| CANTEEN | The canteen form (automatic, or **Month ▸ Sync canteen**), or type rows in INPUT_CANTEEN with SOURCE = `HR_MANUAL`. The **latest** answer of an employee always wins; if it is invalid the older answer is NOT used and the month shows BLOCKED (`CANTEEN_EFFICIENCY_EXCEPTIONS`) until a correct answer (or an HR_MANUAL row) is added. |
| EFFICIENCY | The efficiency form (automatic, or **Month ▸ Sync efficiency**) or rows in INPUT_EFFICIENCY, **one per worker** (there is no "all workers" row any more). Same latest-wins / blocked-when-invalid rule as canteen. A worker with no efficiency % gets production allowance 0 and a warning `EFFICIENCY_NOT_SUBMITTED` (not a blocker). |
| ADVANCE, SOCIETY | Type in INPUT_ADVANCE / INPUT_SOCIETY. Only rows with APPROVAL_STATUS = APPROVED count. Society: if TOTAL_RECOVERY_INR is blank the four component columns (general, emergency, education EMI, shares/other) are added up; if both are filled and differ the total is used with a warning. Advance: a warning when the recovery is more than the opening balance; BLOCKED when the same ACCOUNTS_LEDGER_REFERENCE is entered twice for one employee in the month. |
| ADJUSTMENTS | Type in INPUT_ADJUSTMENTS. Only APPROVED rows count. Pick the type from the drop-down (ARREARS, DISPATCH_INCENTIVE, OTHER_ALLOWANCE, LEAVE_ENCASHMENT, OT_EXTRA_WORK, PRODUCTION_INCENTIVE are additions; TDS, OTHER_DEDUCTION, PENALTY, CANTEEN_EXTRA are deductions). Enter amounts as positive numbers. |
| ATTENDANCE, HOLIDAYS | Nothing to import. Mark them complete when done. |

#### Overtime (OT)

- **Where it comes from:** the OT Google Form is linked into this sheet (tab `OT_FORM_RESPONSES`; name set in PAYROLL_CONTROL `OT_SOURCE_TAB`). Only manager decisions "Approved" count. Requests still waiting for a decision are counted and shown as a WARN (pending hours are not paid). The password columns are never read.
- **Month:** OT is counted by the calendar month of the **OT date**. **September catch-up:** August salary paid OT only up to 25-Aug, so for September (and only September) the window is **26-Aug to 30-Sep** (PAYROLL_CONTROL `OT_WINDOW_START_2026-09 = 2026-08-26`). From October the window is the calendar month again.
- **Reversals:** each request (case number + employee + date) is judged by its **latest** decision. If a manager rejects later, or approves again with different hours, run **Sync OT** again: the old rows are marked SUPERSEDED (their hours are set to 0 and the original hours are kept in EXCEPTION_REASON) and the current decision is written. Running it again with nothing changed does nothing.
- **Employees who are not on the OT form (CON## consultants, BUNG## Pune staff):** type a row in INPUT_OT with **SOURCE_REF = `HR_MANUAL`** (column D), **APPROVAL_STATUS = APPROVED**, PAYROLL_MONTH as `2026-09`, the EMP_ID and OT_HOURS. Such rows count in the payroll (September or later only) and are never touched by Sync OT.
- Rows that cannot be paid (unknown employee, hours not a number, more than 16 hours in one event, ...) are written as EXCEPTION with OT_HOURS 0 and block the month until fixed.

When a feed is finished for the month: **HR OS ▸ Month ▸ Mark feed complete...** and type the feed name. Do this for **all nine** feeds (including LEAVE), even where there is nothing to enter ("empty" is only trusted once you mark it COMPLETE).

### Step D - Readiness (HR)

**HR OS ▸ Payroll ▸ Check readiness**, then open the **PAYROLL_READINESS** tab.

- **READY** - fine.
- **WARN** - you may continue, but read the DETAIL (for example pending OT events, approved July proxy rates, EFFICIENCY_CONFIG state not marked CONFIRMED).
- **HOLD** - a problem of one employee (missing / unapproved attendance, an exception in OT, canteen, efficiency or leave, an open attendance dispute, negative net, ...). The DETAIL names the employees. They are left out of this run (their draft row shows `HOLD` in FLAGS and no net pay) but **the rest of the group is approved and locked normally**. Fix the cause and calculate again to release them.
- **BLOCKED** - a problem of the whole group (working days missing, statutory or salary structure not approved, a feed not complete, leave source unreachable, calculation settings). Must be fixed before approval. Fix the cause (table in section 8) and run Check readiness again.

### Step E - Calculate and approve

0. In **PAYROLL_PERIOD_CATEGORY** the STATUS may show `APPROVED` if HR used it to mark the working days as approved (as the sheet note says): that is accepted and treated like `PENDING`; the first **Calculate draft** turns it into `DRAFT`. Your APPROVED_BY / APPROVED_AT entries there are never overwritten - the payroll approvals write only the HR_APPROVED_* / ACCOUNTS_APPROVED_* columns.
1. **Payroll ▸ Calculate draft** (HR). Draft rows appear in PAYROLL_DRAFT and in PAYROLL_STAFF / _WORKER / _CONSULTANT / _PUNE_STAFF; PAYROLL_RECON shows totals against the previous locked month; PAYROLL_EXCEPTIONS lists every flag. Check the numbers.
2. **Payroll ▸ HR approve (population)** - logged in as the HR approver, once per group. Refused if any BLOCKED check remains. (Approvals are HR, then Accounts; there is no other step.)
3. **Payroll ▸ Accounts approve (population)** - logged in as the Accounts approver.
4. **Payroll ▸ Lock period (population)** - Accounts (or the owner). The approved rows are copied into **PAYROLL_LOCKED**, which cannot be changed. Employees on HOLD are **not** locked and get no payslip; the lock result lists them. (A later release adds a supplementary run for them; until then settle them next month via INPUT_ADJUSTMENTS.) An employee that is already in PAYROLL_LOCKED can never be locked twice.

Any change to an input after HR approval (for example editing a day count) is detected: the group drops back to **DRAFT**, approvals are cleared, and it must be recalculated and approved again. Nothing is silently paid on stale numbers.

### Step F - Payslips and email (STAFF and PERMANENT_WORKER only)

1. **Payslips ▸ Generate payslips (locked only)** - type the month and the group. PDFs go into your private folder under `<month>/<group>/`. Batches of 25 employees run automatically one after another; a leftover file named `TMP_...` should not remain. Anyone whose payslip shows FAILED in **PAYSLIP_REGISTER** (for example no salary structure found) is retried by running the step again.
   The payslip shows UAN, ESI number, PAN and the bank details of each employee; they are looked up while the PDF is made and are not stored anywhere else. Leave balances (EL / CL / SL available) are filled from the leave spreadsheet when the balance tab can be read. Amounts print with Indian grouping and 2 decimals, the joining date as DD-MMM-YYYY, days with 1 decimal; earning / deduction lines that are zero are left blank (totals and net pay always show). Earnings without a line of their own (production incentive, extra-work OT and, on the staff slip, leave encashment) are added into the "Other Allowance" line. For workers the "Production Allowance" line shows the slab amount paid and the "Production Allowance Offset" line follows the efficiency deduction (blank while it is 0).
2. **Payslips ▸ Queue emails** - fills **PAYSLIP_EMAIL_LOG**. Employees with no valid EMAIL_ID in the master are marked SKIPPED (give them the PDF manually).
3. **Releasing the email.** Sending is off by default. To release: in PAYROLL_CONTROL set `EMAIL_RELEASE_ENABLED` to `TRUE`, and add a row with KEY `EMAIL_RELEASE_2026-09` (use the month) and VALUE `TRUE`. Then **Accounts** (logged in as the Accounts approver) runs **Payslips ▸ Send queued emails**. Sending as anyone else is refused. Set the two flags back to FALSE afterwards.

CONSULTANT and PUNE_STAFF get **no payslips** (the program refuses); use PAYROLL_LOCKED for their payment sheet.

## 6b. Employees, categories and top-up runs

- **Categories:** `PAYROLL_CATEGORY_CONFIG` (CATEGORY_CODE, DISPLAY_NAME, CALC_METHOD STAFF / PERMANENT_WORKER / CONSULTANT / PUNE_STAFF, SITE, PAYSLIP Y/N, PAYSLIP_TEMPLATE_KEY STAFF / WORKER, RATE_SOURCE SALARY_STRUCTURE / RATE_PROFILE, ACTIVE, APPROVED_BY / APPROVED_AT). A new category = a new row (then Setup, Prepare month, owner approval). An EMPLOYEE_MASTER category that is not in the tab puts that employee on HOLD `UNKNOWN_CATEGORY`.
- **HR OS ▸ Employees ▸ Add or update employee** (HR or owner login only): a dialog, not a form, so statutory IDs (UAN, ESI no, PAN, bank) never reach a response tab; they are written only to the hidden `EMPLOYEE_STATUTORY_IDS` tab. Add writes EMPLOYEE_MASTER (Active, PENDING_HR_APPROVAL) and a PENDING salary / rate row effective the first of the joining month; a salary revision is a new row with the chosen effective month (older rows stay). HR then runs **Approve salary structure**; until then only that employee is on HOLD.
- **Mark employee exit** sets LAST_WORKING_DAY and Non-Active; the employee stays on the roster for periods up to that month and HR enters the days worked in the register (no automatic proration).
- **Top-up run** (Payroll menu): after a population is LOCKED, fix the held employees (register, attendance approval, feeds, salary approval), then **Run top-up for released employees**, **Top-up: HR approve**, **Top-up: Accounts approve**, **Top-up: lock**. Only EMP_IDs held in the locked run and now free of HOLD are included; the set has its own hash and gets a new LOCK_ID (`...-SUPP`). Generate payslips / queue / send emails with that LOCK_ID (the menu asks for it; blank = the main lock).

## 7. Corrections after lock

There is **no unlock**. If a locked figure was wrong, fix it **next month** by adding an approved row in INPUT_ADJUSTMENTS: `ARREARS` (pay more) or `OTHER_DEDUCTION` (recover). Use the REVERSAL_OF_ENTRY_ID column to point at what you are correcting. The owner can **Reopen** a group only while it is HR_APPROVED or ACCOUNTS_APPROVED (not after lock); it goes back to DRAFT.

### What each status means (PAYROLL_PERIOD_CATEGORY.STATUS)

| Status | Meaning | Next step |
|---|---|---|
| PENDING | Month prepared, nothing calculated. | Enter data, Calculate draft. |
| DRAFT | Calculated, waiting for approval. | HR approve. |
| HR_APPROVED | HR has signed off. | Accounts approve. |
| ACCOUNTS_APPROVED | Accounts has signed off. | Lock. |
| LOCKED | Final. Copied to PAYROLL_LOCKED. | Payslips, emails. |

Feed status: OPEN (still being entered) or COMPLETE. Email status: QUEUED, SENT, FAILED, SKIPPED. Payslip status: GENERATED or FAILED.

## 8. Troubleshooting - common BLOCKED items

| What you see (PAYROLL_READINESS / PAYROLL_EXCEPTIONS) | Meaning | Fix |
|---|---|---|
| PERIOD_WORKING_DAYS: WORKING_DAYS must be a positive number | HR has not typed working days. | Fill WORKING_DAYS in PAYROLL_PERIOD_CATEGORY (not more than days in the month). |
| ATTENDANCE_COVERAGE: no attendance row / duplicate / unknown (HOLD) | Someone active has no row (not entered in the register), or has two. | Enter the employee in the register; delete the duplicate row. An INPUT_ATTENDANCE row of an employee who is not on the roster blocks the group: check the employee is Active (or has a last working day) in the master. |
| ATTENDANCE_APPROVED_VALID: not APPROVED / blank or negative / `ATTENDANCE_OVER_MONTH` (HOLD) | Attendance not approved, a bad number, or present + week-off + holidays + paid leave is more than the days in the month. | Correct the register entry (or the leave), then Approve attendance for that group. |
| ...worked days exceed WORKING_DAYS (worker) | A worker's worked days are more than the month's working days. | Correct the day counts (this only warns for other groups). |
| ...HR_OVERRIDE=Y without OVERRIDE_REASON | Override without a reason. | Write OVERRIDE_REASON. |
| DAILY_ATTENDANCE_COMPLETE: missing daily dates (HOLD) | October onward, employee paid from generated daily data: some dates have no record. | Have the form filled for those dates, then generate again. (Register employees are compared instead.) |
| ATTENDANCE_DISPUTES: `AWAITING_HR` / `AWAITING_OWNER` / `OWNER_REJECTED` / `OWNER_STAMP_INVALID` / `DECISION_NOT_APPLIED` (HOLD) | Daily forms and register disagree and the decision is not finished. | See Step B, October onward, point 3. |
| LEAVE_EXCEPTIONS: leave EXCEPTION rows (HOLD) / `LEAVE_SOURCE_UNREACHABLE` (BLOCKED) | A leave could not be counted, or the leave spreadsheet cannot be opened. | Read EXCEPTION_REASON in INPUT_LEAVE; fix the leave source; for the unreachable source give the runner view access; Sync leave. |
| SALARY_PRESENT_NONZERO: no salary structure / zero pay (HOLD) | No structure effective for the month, or all zero. | Add or correct the row in SALARY_STRUCTURE (EFFECTIVE_FROM on or before month end) or PAYROLL_RATE_PROFILE. |
| FEEDS_COMPLETE: feeds not COMPLETE (includes LEAVE) | You did not mark a feed complete. | Month ▸ Mark feed complete... |
| OT_EXCEPTIONS: OT exceptions | An OT event has an unknown employee, over 16 hours, bad hours or an unreadable date. (A later rejection is not an error: it simply removes the OT.) | Fix the source event in the OT tab (or the master) and Sync OT again; exceptions are never paid. |
| OT_EXCEPTIONS: pending OT events (WARN) | Some OT requests have no manager decision yet. | Get the decision, then Sync OT again. Pending hours are not paid. |
| STATUTORY_CONFIG: missing keys / invalid values | A rate or setting is missing for the month. | Add the key in STATUTORY_CONFIG with EFFECTIVE_FROM on or before the month. |
| DUPLICATE_MASTER_IDS | The same EMP_ID is Active twice. | Fix EMPLOYEE_MASTER (mark one row not Active). |
| CONSULTANT_MONTHLY_OT | A monthly-paid consultant has OT hours. | Remove the OT or ask Accounts to confirm the method. |
| NEGATIVE_NET_PAY | Deductions exceed pay for someone. | Check advances, society, canteen and adjustments for that EMP_ID. |
| WARN EFFICIENCY_NOT_SUBMITTED (worker row in PAYROLL_EXCEPTIONS) | The worker has no efficiency %: production allowance is 0. | Get the efficiency form answer (or an INPUT_EFFICIENCY row for that worker) and calculate again. Not a blocker. |
| CANTEEN_EFFICIENCY_EXCEPTIONS: canteen / efficiency EXCEPTION rows | The latest canteen or efficiency answer of an employee is invalid (bad amount, % over 100, unknown employee, "ALL_WORKERS" row, ...). The older answer is deliberately not used. | Look at the REMARKS of the EXCEPTION row in INPUT_CANTEEN / INPUT_EFFICIENCY, get a correct answer (or add an HR_MANUAL row) and Sync again. |
| PAY_STRUCTURE_APPROVED: SALARY_STRUCTURE not HR-approved | The salary structure row of an employee has no HR_APPROVED_BY. | HR OS ▸ Payroll ▸ Approve salary structure (HR)... (logged in as the HR approver), once for STAFF and once for PERMANENT_WORKER. |
| STATUTORY_CONFIG: not approved by Accounts | A statutory key has no APPROVED_BY. | HR OS ▸ Payroll ▸ Approve statutory config (Accounts)... (logged in as the Accounts approver). |
| PAY_STRUCTURE_APPROVED: PAYROLL_RATE_PROFILE not approved | A consultant / Pune rate row has a VERSION_STATE that is not approved. | Have the row approved (its VERSION_STATE must say APPROVED). `USER_APPROVED_JULY_PROXY` is accepted and only warns (`PROXY_RATE_JUL2026`). |
| Advance: ADVANCE_DUPLICATE_LEDGER_REFERENCE (CALC_BLOCKERS) | The same ACCOUNTS_LEDGER_REFERENCE is approved twice for one employee in the month. | Remove / reverse the duplicate row in INPUT_ADVANCE. |
| Approval says USER_NOT_HR_APPROVER / USER_NOT_ACCOUNTS_APPROVER | Wrong login. | Log in as the address in PAYROLL_CONTROL. |
| Approval says INPUTS_OR_DRAFT_CHANGED | Something changed since the draft. | Calculate draft again, then approve again. |
| Payslips refused: PAYSLIP_FOLDER_ID is blank | Folder not set. | Fill PAYSLIP_FOLDER_ID. |
| Payslips refused: template has tokens with no mapping | The payslip template Doc was edited with a new field. | Ask the developer to map the new field (or remove it from the template). |
| Payslip FAILED: No SALARY_STRUCTURE row | Employee has no salary structure for the month. | Add it, run Generate payslips again. |
| Email release refused | Flags off, or wrong person is running it. | See Step F.3. |

If something looks wrong and you are unsure, stop and check **AUDIT_LOG**: every action, who did it and when, is recorded there.

## 9. Known limitations and open items (please read)

- **Worker ESI basis is unconfirmed.** For permanent workers the ESI is worked out on the fixed monthly gross. Each worker with ESI above zero carries the flag `WORKER_ESI_BASIS_UNCONFIRMED` in the draft. Accounts should confirm the basis before September is paid.
- **Worker efficiency pay:** the production allowance paid is the slab amount for the whole-number efficiency % (below 81 = 0; 81 to 85 = 4,500 / 5,000 / 6,500 / 7,500 / 8,500 from EFFICIENCY_CONFIG; above 85 = 8,500), not prorated, and there is no deduction. The readiness WARN `EFFICIENCY_CONFIG_CONFIRMED` only reflects the IMPLEMENTATION_STATE text in the EFFICIENCY_CONFIG tab; set it to CONFIRMED to clear it.
- **Consultant and Pune rates are proxies.** PAYROLL_RATE_PROFILE currently holds July rates (VERSION_STATE `USER_APPROVED_JULY_PROXY`) used as a stand-in. They are accepted, but every such employee carries the warning `PROXY_RATE_JUL2026`. Replace them with confirmed rates before paying those groups for good.
- **Payslip identity fields** (UAN, ESI number, PAN, bank name / account / IFSC) come from the hidden `EMPLOYEE_STATUTORY_IDS` tab, matched on EMP_ID. An employee missing there gets empty fields; the leave-balance fields (EL / CL / SL available) are read from the leave spreadsheet's yearly balance tabs (`Leave Databse Staff`, `Leave Dadabase PW`) by header: `EMP CODE` and each of `EL Available`, `CL Available`, `SL Available` are looked for in rows 1-6 (one match each, data from the first employee-code row below them); a balance whose header cannot be found stays empty, as does an employee listed in several rows, and the audit entry of the payslip run says why. The salary "rate" columns on the payslip show the employee's fixed monthly structure from SALARY_STRUCTURE (the row effective for that month).
- **The August worker example gap of about Rs 240** between the August worker example and what the calculation gives is **not yet explained**. Reconcile it with Accounts before trusting worker totals.
- Leave comes from its own spreadsheet (read-only). Leave that changes after the attendance rows were approved is not applied automatically (see Leave above).
- Held employees are not paid in the run; the supplementary run for them is not built yet.
- Overtime: a form answer triggers a re-read of that OT date's month automatically; **Month ▸ Sync OT** does the same by hand.
- The employee master has no HR sign-off yet (`HR_SIGNOFF_BY` blank): the code does not gate on it; only SALARY_STRUCTURE and STATUTORY_CONFIG approvals are enforced.
- Old Days-Worked tabs (`PAYROLL_DAYS_FORM_RESPONSES`, `DAYS_WORKED_FORM_RAW`, `INPUT_DAYS_WORKED`, `PAYROLL_DAYS_EXCEPTIONS`) are ignored; the monthly attendance register replaces them.
- **Please confirm:** `OWNER_APPROVER_EMAIL`; that week-off days are added for every group except workers (also daily-rate consultants); the exact wording of the half-day options in the leave form (start "Second Half" and end "First Half" count as half days, "First Half" at the start / "Second Half" at the end, blank and "full" as full days, anything else becomes a leave exception; the flags are ignored whenever Approved Number of days is filled).

## 10. Monthly checklist (first live month: period 2026-09)

1. Back up the sheet; look at existing triggers (section 4); create the private payslip folder.
2. **Run setup**, then set `PAYSLIP_FOLDER_ID`. Check `OT_SOURCE_TAB` (`OT_FORM_RESPONSES`), `OT_WINDOW_START_2026-09` and `LEAVE_WINDOW_START_2026-09` (both `2026-08-26`), **`OWNER_APPROVER_EMAIL`** and that the leave spreadsheet is **shared (view access) with the account that runs HR OS**.
3. **Install triggers** (one trigger). Do **not** create daily attendance forms yet (October onward).
4. **Approve the master data**: Approve salary structure (HR) for STAFF and PERMANENT_WORKER, Approve statutory config (Accounts). Check the PAYROLL_RATE_PROFILE rows (July proxy rates are accepted with a warning).
5. **Prepare month**, then type the working days for the four groups in PAYROLL_PERIOD_CATEGORY (you may set STATUS to APPROVED afterwards, as before). Add holidays to HOLIDAY_CALENDAR.
6. **Sync leave** and read the summary (fix EXCEPTION rows at the source).
7. **Open monthly attendance register**: choose INCLUDES / EXCLUDES weekly offs per group, type one number per employee, submit. Check the warnings (over-month, week-off warnings). Then **Approve attendance** per group.
8. October onward only: **Build daily vs register comparison**, settle disputes (HR submits, owner approves), approve attendance again.
9. **OT:** requests approved in the OT form appear automatically; the September run covers **26-Aug to 30-Sep**. Run **Sync OT** once by hand. For CON##/BUNG## staff type INPUT_OT rows with SOURCE_REF `HR_MANUAL` and APPROVAL_STATUS APPROVED.
10. **Canteen and efficiency:** collect the form answers (one efficiency % per worker); no EXCEPTION row should be left. Type advances, society deductions and adjustments; only APPROVED rows count.
11. **Mark all nine feeds complete** (ATTENDANCE, CANTEEN, OT, EFFICIENCY, ADVANCE, SOCIETY, ADJUSTMENTS, HOLIDAYS, LEAVE), then **Check readiness** until nothing is BLOCKED; read the HOLD and WARN lines (employees on hold, pending OT, proxy rates, DOJ warnings, EFFICIENCY_NOT_SUBMITTED).
12. **Calculate draft**, check PAYROLL_RECON and PAYROLL_EXCEPTIONS (HOLD rows are the employees left out), then HR approve, Accounts approve, Lock per group (the lock lists the held employees).
13. **Payslips** for STAFF and PERMANENT_WORKER (leave balances are filled in when the balance tab can be read); queue emails; release only when Accounts agrees.

## Handbook site

`npm run build` generates a static handbook in `dist/` (this runbook, the design spec, and every Apps Script file with a Copy button). It is deployed to the Netlify project `vfl-hr-os`, which is restricted to Netlify team login and marked `noindex`.

Deployment is automatic: every push to `main` runs the tests, builds `dist/` and deploys it with GitHub Actions (`.github/workflows/deploy.yml`). This needs one repository secret, `NETLIFY_AUTH_TOKEN` (Netlify ▸ User settings ▸ Applications ▸ Personal access tokens). Do not link this repo in Netlify's Git settings; Actions deploys directly and avoids the contributor-verification block.
