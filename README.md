# VFL HR OS — Monthly Payroll

## Quick deploy (2 pastes)
1. Open the HR OS sheet ▸ **Extensions ▸ Apps Script**.
2. Replace the contents of `Code.gs` with [`deploy/HR_OS.gs`](deploy/HR_OS.gs) (open ▸ **Raw** ▸ select all ▸ copy ▸ paste).
3. Project Settings ▸ tick **Show "appsscript.json"** ▸ replace its contents with [`deploy/appsscript.json`](deploy/appsscript.json).
4. Save, reload the sheet, open **HR OS ▸ Setup ▸ Run setup** and approve the Google permission prompt.

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
- Aadhaar numbers, phone numbers and passwords are never read. The OT form's password columns are never read. The only sensitive data used is the payslip identity block (UAN, ESI number, PAN, bank name / account / IFSC): it is read at the moment a payslip is generated, from the hidden `RAW_STAFF_MASTER` / `RAW_WORKER_MASTER` tabs only, and is never written to any tab or to AUDIT_LOG.

## 2. Files in the `apps-script/` folder

Every file below must be created in the Apps Script project with the **same name** (Apps Script adds `.gs` itself).

| File | What it does |
|---|---|
| `appsscript.json` | Project settings and the permissions the program asks for. |
| `00_Config.gs` | Tab names, constants, month helpers, reading PAYROLL_CONTROL. |
| `01_SheetUtil.gs` | Safe reading and writing of sheet tabs (never clears or deletes). |
| `02_Setup.gs` | "Run setup", "Prepare month", "Mark feed complete". |
| `10_Attendance.gs` | Monthly attendance rows, daily-to-monthly summary, attendance approval. |
| `11_AttendanceForms.gs` | Creates the two daily attendance Google Forms (October onward) and holds the single form-submit trigger that feeds attendance, OT, canteen and efficiency into the sheet. |
| `20_Feeds.gs` | Overtime, canteen and efficiency imports; advance and society readers and their checks. |
| `30_Calc.gs` | The pay calculation itself (STAFF, WORKER, CONSULTANT, PUNE). |
| `31_Readiness.gs` | The readiness checks written to PAYROLL_READINESS. |
| `32_Engine.gs` | Runs the calculation and writes the draft tabs. |
| `40_Approval.gs` | HR approve, Accounts approve, owner reopen; approval of the salary structure (HR) and of the statutory config (Accounts). |
| `41_Lock.gs` | Lock: copies the approved draft into PAYROLL_LOCKED. |
| `50_Payslips.gs` | Builds payslip PDFs from the two template Google Docs. |
| `51_Email.gs` | Queues and sends payslip emails (only when released). |
| `90_Menu.gs` | The HR OS menu. |
| `99_Audit.gs` | Writes every action to AUDIT_LOG. |

## 3. How to deploy (one time)

### Option A - copy and paste (simplest)

1. Open the HR OS sheet. Choose **Extensions ▸ Apps Script**. A project opens (bound to this sheet).
2. In the left bar, next to **Files**, click **+ ▸ Script**. Name it exactly like the first file (for example `00_Config`). Delete the default `Code.gs` once you have added the others.
3. Open the matching file from this folder, copy everything, paste it over the empty editor. Repeat for every `.gs` file above.
4. Click the gear icon (**Project Settings**). Tick **Show "appsscript.json" manifest file in editor**. Go back to **Editor**, open `appsscript.json`, and replace its contents with the `appsscript.json` from this folder.
5. Click **Save** (disk icon).
6. Go back to the sheet and **reload the page** (F5). After a few seconds an **HR OS** menu appears.
7. Use any HR OS menu item once. Google asks you to **authorize**: choose your account, click **Advanced ▸ Go to project (unsafe)** (normal for your own scripts) and **Allow**. Run the item again after allowing.

### Option B - clasp (for whoever maintains the code)

`clasp` is Google's command-line tool. Install Node.js, then `npm i -g @google/clasp`, `clasp login`, and
`clasp clone <SCRIPT_ID>` (the Script ID is under Apps Script ▸ Project Settings). Copy the files of `apps-script/` into the cloned folder and run `clasp push`. Same authorization step as Option A applies the first time.

## 4. Before the very first run (pre-flight)

1. **Back up the sheet.** In the HR OS sheet: **File ▸ Make a copy**. Keep the copy safe. Do this before the first setup.
2. **Look at existing triggers.** Apps Script ▸ **Triggers** (alarm-clock icon). Write down what is there. Old triggers such as `PHASE1_V2` or the legacy attendance triggers may double-process data. **Do not delete or disable any of them yourself. Ask the owner; disable them only after the owner approves.** HR OS installs exactly one trigger of its own (plus a short-lived one while a large payslip batch runs); a project can hold at most 5, and HR OS never deletes triggers it did not create.
3. **Create a private Drive folder** for payslips (only you and Accounts should have access). Copy its ID (the long text after `/folders/` in the browser address).
4. After setup (section 5) open the **PAYROLL_CONTROL** tab and fill in:

| KEY | What to put |
|---|---|
| `PAYSLIP_FOLDER_ID` | The private payslip folder ID. Blank means payslips are blocked. |
| `OT_SOURCE_TAB` | Setup writes `OT_FORM_RESPONSES`: the tab the OT Google Form is linked into (in this sheet). If that tab does not exist the old `Overtime_Form` tab is used. |
| `OT_SOURCE_SPREADSHEET_ID` | Setup leaves it **blank** (OT is read from the local tab above). Fill it only if the OT responses live in another spreadsheet; then `OT_SOURCE_TAB` must name the tab there (for example `Form Responses 1`). |
| `OT_WINDOW_START_2026-09` | Setup writes `2026-08-26` (see "OT window" below). Leave it. |

   Also check `HR_APPROVER_EMAIL` (default `hr@varshaforgings.com`) and `ACCOUNTS_APPROVER_EMAIL` (default `accounts@varshaforgings.com`). Approvals only work when the person is logged in as exactly these accounts.
5. Make sure the sheet has current data in: **EMPLOYEE_MASTER**, **SALARY_STRUCTURE** (STAFF and workers, with an EFFECTIVE_FROM date), **PAYROLL_RATE_PROFILE** (consultants and Pune), **STATUTORY_CONFIG**, **EFFICIENCY_CONFIG**.

## 5. First run

1. **HR OS ▸ Setup ▸ Run setup (idempotent)**. It creates the missing tabs and columns and fills default settings. Safe to run again: the second run changes nothing.
2. **HR OS ▸ Setup ▸ Create attendance forms** - needed from **October** (daily forms). Not needed for September. It creates *Daily Attendance - Nashik* and *Daily Attendance - Pune* and stores their IDs in PAYROLL_CONTROL.
3. **HR OS ▸ Setup ▸ Install triggers** - installs **one** trigger for the whole sheet. From then on every answer that lands in `ATT_FORM_NASHIK_RAW`, `ATT_FORM_PUNE_RAW`, the OT tab (`OT_FORM_RESPONSES`), `CANTEEN_FORM_RESPONSES` or `EFFICIENCY_FORM_RESPONSES` is processed automatically (any other tab is ignored). No form IDs are needed. It can be run again safely (it never adds a second one and never touches other triggers; a project can hold at most 5).
4. Do the PAYROLL_CONTROL entries from section 4.
5. **Approve the master data once** (needed before any payroll can be approved): **HR OS ▸ Payroll ▸ Approve salary structure (HR)...** for STAFF and for PERMANENT_WORKER (logged in as the HR approver) and **HR OS ▸ Payroll ▸ Approve statutory config (Accounts)...** (logged in as the Accounts approver). Each shows how many rows it will stamp and asks you to confirm. Until this is done, readiness shows BLOCKED (`PAY_STRUCTURE_APPROVED`, `STATUTORY_CONFIG`).

## 6. Monthly runbook

Who does what: **HR** prepares and approves attendance, feeds and the first approval. **Accounts** gives the second approval, locks and releases emails. The **owner** only steps in for reopen, triggers and access.

The menu asks you to type the month as `YYYY-MM` (for example `2026-09`) and, where needed, the group exactly as `STAFF`, `PERMANENT_WORKER`, `CONSULTANT` or `PUNE_STAFF`.

### Step A - Prepare the month (HR)

1. **HR OS ▸ Month ▸ Prepare month...** - creates the four group rows in PAYROLL_PERIOD_CATEGORY and the eight feed rows in FEED_STATUS (all OPEN).
2. In **PAYROLL_PERIOD_CATEGORY** type **WORKING_DAYS** for each of the four groups of that month (a positive number, not more than the days in the month).
3. Add public holidays to **HOLIDAY_CALENDAR** if any (DATE, SITE = NASHIK / PUNE / ALL, HOLIDAY_NAME, PAID = Y/N).

### Step B - Attendance (HR)

**September 2026 = monthly entry** (no daily forms yet; type in INPUT_ATTENDANCE - the old Days-Worked form was never built and is not used, a new monthly register replaces it later):

1. **HR OS ▸ Month ▸ Prepare monthly attendance (HR entry)** - one PENDING row per active employee appears in INPUT_ATTENDANCE. Employees whose joining date is after the end of the month get no row (the result lists them); a joining date that cannot be read safely (for example `03/10/2026`, which could be 3 October or 10 March) keeps the employee in and shows a warning `DOJ_AMBIGUOUS`. The WORKING_DAYS column of the rows follows PAYROLL_PERIOD_CATEGORY: running this step again after HR changes the working days refreshes PENDING rows (approved rows are never changed).
2. HR types the day counts per employee: PRESENT_DAYS, PHYSICAL_PRESENT_DAYS, WEEK_OFF, PH, EL_AVAILED, CL_AVAILED, SL_AVAILED, PAID_LEAVE_OTHER, ABSENT_LWP_DAYS. Leave nothing blank in PRESENT_DAYS. For PERMANENT_WORKER, PHYSICAL_PRESENT_DAYS drives the VDA; if it is left blank the efficiency form's "Physical present days" is used when given, otherwise PRESENT_DAYS (as in August) - never a blocker. Worked days for a worker = present + EL + CL + SL + PH + other paid leave (week-off is not counted for workers) and must not exceed WORKING_DAYS.
3. **HR OS ▸ Month ▸ Approve attendance (population)...** once per group. Rows with a problem are listed and stay PENDING until fixed.

**October onward = daily forms:**

1. Supervisors fill the daily Nashik / Pune forms each day (mark only exceptions; blanks count as present, weekly off or paid holiday). Sending the same date again replaces the earlier answer.
2. At month end: **HR OS ▸ Month ▸ Generate monthly attendance from daily**. Any date without a record is shown as MISSING and blocks approval.
3. If HR changes a generated number by hand, set HR_OVERRIDE = Y and write OVERRIDE_REASON. Then approve as in the September step 3.

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

When a feed is finished for the month: **HR OS ▸ Month ▸ Mark feed complete...** and type the feed name. Do this for **all eight** feeds, even where there is nothing to enter ("empty" is only trusted once you mark it COMPLETE).

### Step D - Readiness (HR)

**HR OS ▸ Payroll ▸ Check readiness**, then open the **PAYROLL_READINESS** tab.

- **READY** - fine.
- **WARN** - you may continue, but read the DETAIL (for example pending OT events, approved July proxy rates, EFFICIENCY_CONFIG state not marked CONFIRMED).
- **BLOCKED** - must be fixed before approval. Fix the cause (table in section 8) and run Check readiness again.

### Step E - Calculate and approve

0. In **PAYROLL_PERIOD_CATEGORY** the STATUS may show `APPROVED` if HR used it to mark the working days as approved (as the sheet note says): that is accepted and treated like `PENDING`; the first **Calculate draft** turns it into `DRAFT`. Your APPROVED_BY / APPROVED_AT entries there are never overwritten - the payroll approvals write only the HR_APPROVED_* / ACCOUNTS_APPROVED_* columns.
1. **Payroll ▸ Calculate draft** (HR). Draft rows appear in PAYROLL_DRAFT and in PAYROLL_STAFF / _WORKER / _CONSULTANT / _PUNE_STAFF; PAYROLL_RECON shows totals against the previous locked month; PAYROLL_EXCEPTIONS lists every flag. Check the numbers.
2. **Payroll ▸ HR approve (population)** - logged in as the HR approver, once per group. Refused if any BLOCKED check remains. (Approvals are HR, then Accounts; there is no other step.)
3. **Payroll ▸ Accounts approve (population)** - logged in as the Accounts approver.
4. **Payroll ▸ Lock period (population)** - Accounts (or the owner). The approved rows are copied into **PAYROLL_LOCKED**, which cannot be changed.

Any change to an input after HR approval (for example editing a day count) is detected: the group drops back to **DRAFT**, approvals are cleared, and it must be recalculated and approved again. Nothing is silently paid on stale numbers.

### Step F - Payslips and email (STAFF and PERMANENT_WORKER only)

1. **Payslips ▸ Generate payslips (locked only)** - type the month and the group. PDFs go into your private folder under `<month>/<group>/`. Batches of 25 employees run automatically one after another; a leftover file named `TMP_...` should not remain. Anyone whose payslip shows FAILED in **PAYSLIP_REGISTER** (for example no salary structure found) is retried by running the step again.
   The payslip shows UAN, ESI number, PAN and the bank details of each employee; they are looked up while the PDF is made and are not stored anywhere else. Leave-balance fields stay empty. For workers the "Production Allowance" line shows the slab amount paid and the "Production Allowance Offset" line is always 0.
2. **Payslips ▸ Queue emails** - fills **PAYSLIP_EMAIL_LOG**. Employees with no valid EMAIL_ID in the master are marked SKIPPED (give them the PDF manually).
3. **Releasing the email.** Sending is off by default. To release: in PAYROLL_CONTROL set `EMAIL_RELEASE_ENABLED` to `TRUE`, and add a row with KEY `EMAIL_RELEASE_2026-09` (use the month) and VALUE `TRUE`. Then **Accounts** (logged in as the Accounts approver) runs **Payslips ▸ Send queued emails**. Sending as anyone else is refused. Set the two flags back to FALSE afterwards.

CONSULTANT and PUNE_STAFF get **no payslips** (the program refuses); use PAYROLL_LOCKED for their payment sheet.

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
| ATTENDANCE_COVERAGE: no attendance row / duplicate / unknown | Someone active has no row, or has two. | Run Prepare monthly attendance again; delete the duplicate row; check the employee is Active in the master. |
| ATTENDANCE_APPROVED_VALID: not APPROVED / blank or negative | Attendance not approved or bad number. | Correct the number, then Approve attendance for that group. |
| ...worked days exceed WORKING_DAYS (worker) | A worker's worked days are more than the month's working days. | Correct the day counts (this only warns for other groups). |
| ...HR_OVERRIDE=Y without OVERRIDE_REASON | Override without a reason. | Write OVERRIDE_REASON. |
| DAILY_ATTENDANCE_COMPLETE: missing daily dates | October onward: some dates have no record. | Have the form filled for those dates, then generate again. |
| SALARY_PRESENT_NONZERO: no salary structure / zero pay | No structure effective for the month, or all zero. | Add or correct the row in SALARY_STRUCTURE (EFFECTIVE_FROM on or before month end) or PAYROLL_RATE_PROFILE. |
| FEEDS_COMPLETE: feeds not COMPLETE | You did not mark a feed complete. | Month ▸ Mark feed complete... |
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
- **Payslip identity fields** (UAN, ESI number, PAN, bank name / account / IFSC) come from the hidden `RAW_STAFF_MASTER` / `RAW_WORKER_MASTER` tabs, matched on EMP CODE. An employee missing there gets empty fields; leave-balance fields are always empty. The salary "rate" columns on the payslip show the employee's fixed monthly structure from SALARY_STRUCTURE (the row effective for that month).
- **The August worker example gap of about Rs 240** between the August worker example and what the calculation gives is **not yet explained**. Reconcile it with Accounts before trusting worker totals.
- The external leave sheet is not a payroll feed in v1; HR types EL/CL/SL in attendance.
- Overtime: a form answer triggers a re-read of that OT date's month automatically; **Month ▸ Sync OT** does the same by hand.
- The employee master has no HR sign-off yet (`HR_SIGNOFF_BY` blank): the code does not gate on it; only SALARY_STRUCTURE and STATUTORY_CONFIG approvals are enforced.
- Old Days-Worked tabs (`PAYROLL_DAYS_FORM_RESPONSES`, `DAYS_WORKED_FORM_RAW`, `INPUT_DAYS_WORKED`, `PAYROLL_DAYS_EXCEPTIONS`) are ignored; a new monthly register will replace them in the next phase.

## 10. September checklist (first live month, period 2026-09)

1. Back up the sheet; look at existing triggers (section 4); create the private payslip folder.
2. **Run setup**, then set `PAYSLIP_FOLDER_ID`. Check that `OT_SOURCE_TAB` matches the tab the OT form writes to (`OT_FORM_RESPONSES`) and that `OT_WINDOW_START_2026-09` is `2026-08-26`.
3. **Install triggers** (one trigger). Do **not** create daily attendance forms yet (October onward).
4. **Approve the master data**: Approve salary structure (HR) for STAFF and PERMANENT_WORKER, Approve statutory config (Accounts). Check the PAYROLL_RATE_PROFILE rows (July proxy rates are accepted with a warning).
5. **Prepare month** `2026-09`, then type the working days for the four groups in PAYROLL_PERIOD_CATEGORY (you may set STATUS to APPROVED afterwards, as before). Add holidays if any.
6. **Prepare monthly attendance (HR entry)**, type the day counts in INPUT_ATTENDANCE (workers: PHYSICAL_PRESENT_DAYS too, or rely on PRESENT_DAYS), then **Approve attendance** per group.
7. **OT:** requests approved in the OT form appear automatically; the September run covers **26-Aug to 30-Sep** (the August salary paid OT only to 25-Aug). Run **Sync OT** once by hand and read the summary. For CON##/BUNG## staff type INPUT_OT rows with SOURCE_REF `HR_MANUAL` and APPROVAL_STATUS APPROVED.
8. **Canteen and efficiency:** collect the form answers (one efficiency % per worker); check that no EXCEPTION row is left. Type advances, society deductions (components are enough) and adjustments; only APPROVED rows count.
9. **Mark all eight feeds complete**, then **Check readiness** until nothing is BLOCKED; read the WARN lines (pending OT, proxy rates, DOJ warnings, EFFICIENCY_NOT_SUBMITTED).
10. **Calculate draft**, check PAYROLL_RECON and PAYROLL_EXCEPTIONS, then HR approve, Accounts approve, Lock per group.
11. **Payslips** for STAFF and PERMANENT_WORKER; queue emails; release only when Accounts agrees.

## Handbook site

`npm run build` generates a static handbook in `dist/` (this runbook, the design spec, and every Apps Script file with a Copy button). It is deployed to the Netlify project `vfl-hr-os`, which is restricted to Netlify team login and marked `noindex`.

Deployment is automatic: every push to `main` runs the tests, builds `dist/` and deploys it with GitHub Actions (`.github/workflows/deploy.yml`). This needs one repository secret, `NETLIFY_AUTH_TOKEN` (Netlify ▸ User settings ▸ Applications ▸ Personal access tokens). Do not link this repo in Netlify's Git settings; Actions deploys directly and avoids the contributor-verification block.
