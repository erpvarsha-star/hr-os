# HR OS - Deploy steps (for the owner, no technical knowledge needed)

Follow the steps in order. After every step you will see what you should see. If you do not see it, read "If it fails" and stop. Do not try to fix things by guessing. Nothing here can lose your data: step B makes a backup copy first.

## A. Before you start

1. **Who does this:** the owner of the HR OS Google Sheet. Log in to Google with that account only.
2. **Keep these ready:**
   - The file `HR_OS_IMPORT.xlsx` on your computer.
   - A private Google Drive folder for payslips (create a new folder, keep it shared with nobody). You will need the folder ID: open the folder and copy the long text at the end of the address in the browser.
   - The Overtime (OT) Google Form must already be linked into the HR OS sheet (it shows as a tab of responses in the sheet).
3. The leave sheet `1pwVE0XKqAhAKHbyqtlF9GzfuGnidnZuw2zKbtMjUz9Q` must give **view access** to the account that runs payroll. Open that sheet, press Share, add the payroll account, choose Viewer.

You should see: you are logged in as the sheet owner and the HR OS sheet is open.

If it fails: if you are not sure which account you are, click your picture at the top right of Google and check the email.

## B. Clean the old sheet

The clean-up keeps only the tabs that receive Google Form answers. Everything else is removed. A backup copy is made first.

1. Open the HR OS sheet. Click **Extensions ▸ Apps Script**. A new tab opens with the code.
2. On the left, under **Files**, you will see old script files. Delete every one of them **except one** (Apps Script needs at least one file). To delete: hover on the file, click the three dots, choose **Delete**.
3. Click the file that is left. Select everything (Ctrl+A) and press Delete so the file is empty.
4. Open the **Script** page of the handbook site, open the last box (*one-time old-sheet cleanup*) and press **Copy**.
5. Go back to the Apps Script tab, click in the empty file and paste (Ctrl+V). Click the **Save** icon (or Ctrl+S).
6. At the top, in the function box choose **step1_preview** and click **Run**. Google asks for permission: click **Review permissions**, choose your account, then **Advanced ▸ Go to (project) ▸ Allow**.
7. A message opens in the sheet tab (switch to the sheet tab if you do not see it). It shows: tabs to KEEP, tabs to DELETE, renames, and triggers to delete. **Read it.** Check that the three form tabs (canteen, efficiency, OT) are under KEEP. This step changes nothing.
8. Back in Apps Script choose **step2_cleanup** and click **Run**. Again read the list. A box asks you to type **DELETE** (capital letters). Type it and press OK.
9. A message shows the **backup link**. Copy that link and save it (send it to yourself on WhatsApp or email). This is your safety copy.
10. At the end a final report opens. Read it. It says how many tabs were deleted and if there were errors.
11. In Apps Script click the clock icon (**Triggers**) on the left. The list should be empty.
12. Go to the file, select everything and delete it so the file is empty again. (Do not keep the clean-up code.)

You should see: the sheet has only the form tabs (and maybe a tab called `_TEMP`, which is removed later), the Triggers list is empty, and you have a backup link.

If it fails:
- "Backup failed - stopped": nothing was deleted. Send me a screenshot.
- Report says "Errors" for some tab: those tabs stay. Send me a screenshot.
- Old triggers still shown: they were made by another person. Ask that person to open **Extensions ▸ Apps Script ▸ Triggers** in their own login and delete theirs.

## C. Import the new tabs

1. In the HR OS sheet click **File ▸ Import ▸ Upload**. Choose or drag `HR_OS_IMPORT.xlsx`.
2. Choose **Insert new sheet(s)** and click **Import data**.
   **Never choose "Replace spreadsheet". It disconnects the forms.**
3. Delete the downloaded `HR_OS_IMPORT.xlsx` from your computer (Downloads folder and Recycle Bin). It contains personal data.

You should see: new tabs such as PAYROLL_CONTROL, EMPLOYEE_MASTER, SALARY_STRUCTURE and the INPUT_ tabs next to the form tabs.

If it fails: if you chose "Replace spreadsheet" by mistake, do not do anything else. Open the backup link from step B and send it to me.

## D. Deploy the new script

1. Click **Extensions ▸ Apps Script**.
2. The project must contain **only two files: `HR_OS.gs` and `appsscript.json`**. Delete every other file. Click the one file that is there and select everything and delete it (rename it to `HR_OS` if you like).
3. Open the **Script** page of the handbook site (vfl-hr-os.netlify.app/code/) and note the version printed at the top. Press **Copy** under `HR_OS.gs`, go back and paste into the file. Click Save.
4. On the left click the gear icon **Project Settings**. Tick **Show "appsscript.json" manifest file in editor**.
5. Go back to **Editor**, click `appsscript.json`, select everything and delete. Press **Copy** under `appsscript.json` on the Script page, paste, Save.
6. Close the Apps Script tab. **Reload** the sheet (press F5).
7. After a few seconds a menu **HR OS** appears at the top.
8. Click **HR OS ▸ Setup ▸ Run setup (idempotent)**. Authorise when Google asks (same as step B.6). Wait for the message "done".
   Then click **HR OS ▸ About HR OS**: the version shown must be the same as the version on the Script page.
9. Click **HR OS ▸ Setup ▸ Install triggers**.
10. Open the tab **PAYROLL_CONTROL**. Find the row `PAYSLIP_FOLDER_ID` and paste your Drive folder ID in the VALUE column.
11. In the same tab check: `OT_SOURCE_TAB` is `OT_FORM_RESPONSES` (the name of your OT form tab); `LEAVE_SOURCE_SPREADSHEET_ID` is `1pwVE0XKqAhAKHbyqtlF9GzfuGnidnZuw2zKbtMjUz9Q`; `LEAVE_SOURCE_TAB` is `Leave_Applications`.

You should see: the HR OS menu, many new tabs, and a message after setup and after Install triggers.

If it fails:
- No HR OS menu after reload: reload once more and wait 10 seconds.
- Red error text on run: take a screenshot and send it. Do not run it again and again.
- The setup output mentions NASHIK, or has no `version` line: you are running an old script. Other `.gs` files are still in the Apps Script project. Delete them so only `HR_OS.gs` and `appsscript.json` remain, paste `HR_OS.gs` again, save, reload, run Setup, check About HR OS.

## E. One-time sign-offs

Each sign-off must be done by the person named, logged in with **their own Google account**. Use the menu **HR OS ▸ Payroll**. A box shows what will be approved; press OK.

1. **Owner** (your login, the email in `OWNER_APPROVER_EMAIL`): **Approve category config (owner)...**
2. **HR** (login of `HR_APPROVER_EMAIL`): **Approve salary structure (HR)...** Enter period `2026-09`. Do it once for each category (STAFF, PERMANENT_WORKER, CONSULTANT, PUNE_STAFF) when it asks.
3. **Accounts** (login of `ACCOUNTS_APPROVER_EMAIL`): **Approve statutory config (Accounts)...** Enter period `2026-09`.

You should see: a message that rows were stamped as approved.

If it fails: a message saying you are not the approver means the wrong Google account is logged in. Log out, log in with the right one, and try again.

## E2. Updating the script later

1. Extensions ▸ Apps Script. Keep only `HR_OS.gs` and `appsscript.json`.
2. Replace the whole contents of `HR_OS.gs` with the new one from the **Script** page. Save.
3. Reload the sheet, then run **HR OS ▸ Setup ▸ Run setup**.
4. Open **HR OS ▸ About HR OS** and check the version equals the one on the Script page.

## E3. Sites, forms and people

- Two sites: **VFL (Waluj plant)** and **PUNE (Pune office)**.
- One daily form, **Daily Attendance – VFL Waluj**, covers Staff, Permanent Workers and Consultants (grouped by department). Pune staff have their own form, **Daily Attendance – Pune**.
- After adding or exiting people run **HR OS ▸ Setup ▸ Refresh form rosters** so the forms show the right names.
- To exit many people at once: **HR OS ▸ Employees ▸ Bulk mark exits**. Paste one person per line, like this, then check the preview and press Yes:

```
E101, 31-07-2026
E102, 15-08-2026
```

  Dates can be DD-MM-YYYY, DD/MM/YYYY or 31-Jul-2026. People already Non-Active are skipped. Lines with a problem are listed and not applied.

## E4. One-time: put the tabs in order and colour them

This is optional and can be done any time after the tabs exist. It only moves tabs and gives them a colour. It never deletes, renames or edits anything, and hidden tabs stay hidden.

1. Open the HR OS sheet, click **Extensions ▸ Apps Script**.
2. Click the **+** next to **Files**, choose **Script**, and name the new file **ORGANISE_TABS**.
3. On the **Script** page of the handbook site open the box *One-time: reorder and colour the tabs*, press **Copy**, paste it into the new file (replace anything in it) and Save.
4. Choose **organiseTabs_step1_preview** and click **Run**. Allow permissions if asked. A message in the sheet shows the new order, the colour of each group, and any tabs it does not recognise. **Read it.** This step changes nothing.
5. If it looks right, choose **organiseTabs_step2_apply** and click **Run**. A message says how many tabs were moved and recoloured. Running it again is harmless.
6. Delete the ORGANISE_TABS file (three dots next to it, **Delete**). The project must go back to only `HR_OS.gs` and `appsscript.json`.

Tabs it does not recognise (for example an old `ATT_FORM_NASHIK_OLD`) are put at the very end with no colour. Look at them and delete them by hand if they are not needed.

| Order | Group | Colour |
|---|---|---|
| 1 | Control & setup | Slate grey `#607D8B` |
| 2 | Masters | Blue `#1E88E5` |
| 3 | Attendance | Teal `#00ACC1` |
| 4 | Monthly inputs | Green `#43A047` |
| 5 | Form responses (raw, do not edit) | Orange `#FB8C00` |
| 6 | Payroll run | Purple `#8E24AA` |
| 7 | Payslips | Pink `#EC407A` |
| 8 | Locked & audit | Dark red `#C62828` |
| 9 | Not recognised (end) | No colour |

## E5. Monthly attendance forms (days present via Google Forms)

**HR OS ▸ Setup ▸ Create attendance forms** also creates two monthly forms: **Monthly Attendance – VFL Waluj** (Staff, Permanent workers, Consultants) and **Monthly Attendance – Pune**. Their response tabs are `ATT_MONTHLY_VFL_RAW` / `ATT_MONTHLY_PUNE_RAW`. Owner steps, once per form:

1. Open the form ▸ Settings ▸ Responses and confirm **Collect email addresses: Verified**.
2. Share the live link with HR only. Run **Setup ▸ Install triggers** if not done (the same single trigger handles these forms).
3. After joiners / leavers, run **Setup ▸ Refresh form rosters** (it updates the monthly forms too).

HR fills the form once per month (it can be submitted in parts: only filled boxes are saved). The result arrives by email. Allowed emails: HR approver, owner, `REGISTER_ENTRY_EMAILS` (all sites); `REGISTER_ENTRY_EMAILS_VFL` (default hrmanager@varshaforgings.com) may enter VFL employees only and `REGISTER_ENTRY_EMAILS_PUNE` (default ea.varshaforgings@gmail.com) Pune employees only (the in-sheet register shows them only their site); anyone else is rejected and nothing is written. HR then approves attendance per group as before. The in-sheet register still works and writes the same rows.

## E6. Telegram alerts (optional)

1. In Telegram open **@BotFather**, send `/newbot`, choose a name, copy the token.
2. **HR OS ▸ Alerts ▸ Telegram: set bot token**, paste it.
3. **HR OS ▸ Alerts ▸ Install reminder triggers** (once - see step 6 below; this is also what turns on automatic Telegram registration).
4. Each person (HR, Accounts, attendance entry people) opens the bot and presses **Start**. Within about 5 minutes they are registered on their own - nothing more for the owner to click. (If someone wants to check sooner, **HR OS ▸ Alerts ▸ Telegram: refresh chats** does the same thing immediately.) Then type each person's email in the **EMAIL** column of the new tab `TELEGRAM_CHATS` to link them.
5. **HR OS ▸ Alerts ▸ Telegram: send test message to me** (it tells you if it went by Telegram or email).
6. **HR OS ▸ Alerts ▸ Install reminder triggers** (daily attendance reminder ~11:00, escalation ~14:00, month-end input digest ~11:05, automatic Telegram registration check every ~5 minutes). Remove them any time with **Remove reminder triggers**.

   VFL runs on a 24-hour "shift day" that starts at 07:00 and ends at 07:00 the next calendar day (e.g. shift-day "6 Oct" = 6 Oct 07:00 to 7 Oct 07:00), and the daily attendance form's Date field is always the shift-day's START date. The 11:00/14:00 timers still fire at 11:00/14:00 as before - what changed is which shift-day they check: at 11:00/14:00 today they check YESTERDAY's shift-day (the one that just finished at 07:00 this morning), not today's (which has barely started and can never be complete). The reminder email now says the shift-day explicitly, e.g. "not received for shift-day 06-Oct-2026 (07:00 06-Oct to 07:00 07-Oct)."

The first run after updating the script asks for one extra permission (connect to external services). Click Allow once, as the owner. Until Telegram is set up, alerts go by email.

## F. Quick self-check

- The **HR OS** menu is visible.
- Extensions ▸ Apps Script ▸ Triggers shows **one** trigger (hrosOnFormSubmit, "From spreadsheet - On form submit").
- These tabs exist (after setup, in this order; hidden tabs are marked). The tab `_TEMP` is gone.

  PAYROLL_CONTROL, PAYROLL_PERIOD_CATEGORY, FEED_STATUS, PAYROLL_CATEGORY_CONFIG, STATUTORY_CONFIG, EFFICIENCY_CONFIG, PT_EXEMPTIONS, HOLIDAY_CALENDAR, EMPLOYEE_MASTER, SALARY_STRUCTURE, PAYROLL_RATE_PROFILE, EMPLOYEE_STATUTORY_IDS (hidden), INPUT_OT, INPUT_CANTEEN, INPUT_EFFICIENCY, INPUT_ADVANCE, INPUT_SOCIETY, INPUT_ADJUSTMENTS, INPUT_LEAVE, ATTENDANCE_DAILY, OT_FORM_RESPONSES, CANTEEN_FORM_RESPONSES, EFFICIENCY_FORM_RESPONSES, INPUT_ATTENDANCE, ATTENDANCE_COMPARISON, PAYROLL_READINESS, PAYROLL_DRAFT, PAYROLL_STAFF, PAYROLL_WORKER, PAYROLL_CONSULTANT, PAYROLL_PUNE_STAFF, PAYROLL_EXCEPTIONS, PAYROLL_RECON, PAYROLL_SUPPLEMENTARY, PAYROLL_LOCKED (hidden), PAYSLIP_REGISTER, PAYSLIP_EMAIL_LOG, AUDIT_LOG, TELEGRAM_CHATS.

- The daily attendance form tabs (ATT_FORM_VFL_RAW, ATT_FORM_PUNE_RAW) appear only when you run **Setup ▸ Create attendance forms**. That is needed from October, not for September.

If something is missing: run **HR OS ▸ Setup ▸ Run setup** once more (it is safe to repeat). If still missing, send a screenshot of the tab bar.

## G. September payroll run

Follow the monthly runbook in [README.md](README.md) (section 6, "Monthly runbook", and section 10, "Monthly checklist"). In short: Prepare month 2026-09, sync leave / OT / canteen / efficiency, approve attendance, Check readiness, Calculate draft, HR approve, Accounts approve, Lock, Generate payslips. Do not send payslip emails until HR says so (`EMAIL_RELEASE_ENABLED` stays FALSE). To preview a real payslip before any lock, run **Payslips ▸ Send test payslip to me...** after Calculate draft (goes only to you; creates the payslip folder if `PAYSLIP_FOLDER_ID` is blank). Payslip sending stops at `EMAIL_QUOTA_RESERVE` (10) remaining daily e-mails and resumes automatically next day about 09:00 IST.

## H. Troubleshooting

- **Output mentions NASHIK or has no `version`:** stale script, other `.gs` files are still in the project. See the D troubleshooting above.
- **`Unknown population "X"`:** run **HR OS ▸ Setup ▸ Run setup**. It converts old site values to the new ones.
- **Bulk mark exits shows errors:** each error line says what is wrong (unknown EMP_ID, bad date, duplicate). Fix the line and run it again; people already done are skipped.

## I. If something goes wrong

1. **Stop.** Do not delete or rename anything else.
2. Your **backup copy** (link saved in step B.9) has everything as it was before the clean-up. To go back: open the backup link, then File ▸ Make a copy, or use it as the working sheet until we fix the problem.
3. Send me a **screenshot** of the error message and of the tab bar at the bottom of the sheet, and tell me which step number you were on.
