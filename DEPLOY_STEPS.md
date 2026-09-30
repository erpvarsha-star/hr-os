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

## F. Quick self-check

- The **HR OS** menu is visible.
- Extensions ▸ Apps Script ▸ Triggers shows **one** trigger (hrosOnFormSubmit, "From spreadsheet - On form submit").
- These tabs exist (after setup, in this order; hidden tabs are marked). The tab `_TEMP` is gone.

  PAYROLL_CONTROL, PAYROLL_PERIOD_CATEGORY, FEED_STATUS, PAYROLL_CATEGORY_CONFIG, STATUTORY_CONFIG, EFFICIENCY_CONFIG, PT_EXEMPTIONS, HOLIDAY_CALENDAR, EMPLOYEE_MASTER, SALARY_STRUCTURE, PAYROLL_RATE_PROFILE, EMPLOYEE_STATUTORY_IDS (hidden), INPUT_OT, INPUT_CANTEEN, INPUT_EFFICIENCY, INPUT_ADVANCE, INPUT_SOCIETY, INPUT_ADJUSTMENTS, INPUT_LEAVE, ATTENDANCE_DAILY, OT_FORM_RESPONSES, CANTEEN_FORM_RESPONSES, EFFICIENCY_FORM_RESPONSES, INPUT_ATTENDANCE, ATTENDANCE_COMPARISON, PAYROLL_READINESS, PAYROLL_DRAFT, PAYROLL_STAFF, PAYROLL_WORKER, PAYROLL_CONSULTANT, PAYROLL_PUNE_STAFF, PAYROLL_EXCEPTIONS, PAYROLL_RECON, PAYROLL_SUPPLEMENTARY, PAYROLL_LOCKED (hidden), PAYSLIP_REGISTER, PAYSLIP_EMAIL_LOG, AUDIT_LOG.

- The daily attendance form tabs (ATT_FORM_VFL_RAW, ATT_FORM_PUNE_RAW) appear only when you run **Setup ▸ Create attendance forms**. That is needed from October, not for September.

If something is missing: run **HR OS ▸ Setup ▸ Run setup** once more (it is safe to repeat). If still missing, send a screenshot of the tab bar.

## G. September payroll run

Follow the monthly runbook in [README.md](README.md) (section 6, "Monthly runbook", and section 10, "Monthly checklist"). In short: Prepare month 2026-09, sync leave / OT / canteen / efficiency, approve attendance, Check readiness, Calculate draft, HR approve, Accounts approve, Lock, Generate payslips. Do not send payslip emails until HR says so (`EMAIL_RELEASE_ENABLED` stays FALSE).

## H. Troubleshooting

- **Output mentions NASHIK or has no `version`:** stale script, other `.gs` files are still in the project. See the D troubleshooting above.
- **`Unknown population "X"`:** run **HR OS ▸ Setup ▸ Run setup**. It converts old site values to the new ones.
- **Bulk mark exits shows errors:** each error line says what is wrong (unknown EMP_ID, bad date, duplicate). Fix the line and run it again; people already done are skipped.

## I. If something goes wrong

1. **Stop.** Do not delete or rename anything else.
2. Your **backup copy** (link saved in step B.9) has everything as it was before the clean-up. To go back: open the backup link, then File ▸ Make a copy, or use it as the working sheet until we fix the problem.
3. Send me a **screenshot** of the error message and of the tab bar at the bottom of the sheet, and tell me which step number you were on.
