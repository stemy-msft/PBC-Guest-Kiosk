# ADMINISTRATION.md

# PBC Visitor Kiosk Administration Guide

This document provides administrative guidance for operating, maintaining, and supporting the PBC Visitor Kiosk system.

---

# Overview

The PBC Visitor Kiosk consists of the following components:

| Component | Purpose |
|------------|------------|
| Frontend | Visitor-facing kiosk interface |
| Backend | Visitor records, badge generation, and print queue management |
| Print Agent | Retrieves print jobs and sends badges to the printer |
| Raspberry Pi Print Server | Hosts the print agent and printer queue |
| Brother QL-800 | Badge printer |

System workflow:

Visitor Check-In → Badge Generation → Print Queue → Print Agent → Printer

---

# Administrative Responsibilities

System administrators are responsible for:

- Managing staff accounts
- Maintaining printer availability
- Monitoring print jobs
- Ensuring backups are performed
- Applying software updates
- Maintaining system documentation
- Verifying badge printing functionality before operational use

---

# Initial Administrator Setup

After installation:

1. Start Backend
2. Start Frontend
3. Start Print Agent
4. Verify Printer Status
5. Print a test badge
6. Verify administrator login
7. Change default administrative credentials if applicable

---

# Staff Account Management

## Adding Staff Accounts

Note: At milestone6, there is a limitation of a single staff account controlled in the .env

Staff accounts should be created only for authorized camp personnel.

Required fields:

- Full Name
- Username
- Password
- Email Address (optional)
- Role

Recommended account naming:

| Name | Username |
|--------|--------|
| John Smith | jsmith |
| Jane Doe | jdoe |

Avoid shared accounts whenever possible.

---

## Password Requirements

Recommended minimum requirements:

- Minimum 12 characters
- Uppercase letter
- Lowercase letter
- Number
- Special character

Examples:

✅ Good:
- Camp2026!
- PBC_Admin#42

❌ Avoid:
- password
- pbc123
- summercamp

---

## Password Reset Procedure

If a staff member cannot access their account:

1. Locate the user account.
2. Reset the password.
3. Require the user to change their password at next login (if supported).
4. Verify successful login.

---

## Disabling Staff Accounts

Disable accounts whenever:

- Seasonal staff leave
- Volunteers no longer require access
- Credentials may have been compromised

Do not delete accounts unless required.

Historical records should remain intact.

---

# Roles and Permissions

Suggested role model:

## Administrator

Full access.

Can:

- Manage users
- Configure system settings
- View all visitor records
- Reprint badges
- Manage print settings

---

## Office Staff

Operational access.

Can:

- Search visitors
- Check visitors in
- Check visitors out
- Reprint badges

Cannot:

- Modify system settings
- Manage users

---

## Volunteer

Limited operational access.

Can:

- Check visitors in

Cannot:

- Manage users
- Access administrative settings
- View system configuration

---

# Daily Startup Procedure

Perform before visitors arrive.

## Backend

Verify:

- Backend service running
- Database accessible

Test:

```bash
curl http://kiosk-backend.domain.local:8000
```

Expected result:

```json
{
  "application": "PBC Visitor Kiosk"
}
```

---

## Frontend

Verify:

- Kiosk loads successfully
- Photo capture functions correctly

---

## Print Agent

Verify:

```bash
python print_agent.py
```

Expected startup message:

```text
PBC Visitor Kiosk print agent started
```

---

## Printer

Verify:

```bash
lpstat -p
```

Expected:

```text
printer QL800_BROTHER is idle
```

---

## Test Print

Print a badge before opening for guests.

Verify:

- Correct sizing
- Correct brightness
- Correct alignment
- Successful cut

---

# Daily Shutdown Procedure

At the end of each day:

1. Verify all guests have been checked out.
2. Review any failed print jobs.
3. Verify backups completed.
4. Shut down kiosk workstation if appropriate.
5. Leave print server running unless maintenance is required.

---

# Print Queue Administration

## View Queue

```bash
lpstat -o
```

---

## Cancel All Outstanding Jobs

```bash
cancel -a
```

---

## View Printer Status

```bash
lpstat -p
```

---

## Test Print

```bash
lp -d QL800_BROTHER test.png
```

---

# Known Good Printer Configuration

Production printing relies on the following printer configuration:

Queue:

```text
QL800_BROTHER
```

Print Settings:

```text
PageSize = 62x100
BrPriority = BrQuality
BrBrightness = 15
```

These values were selected after testing for:

- Correct badge dimensions
- Reduced halftoning
- Improved photo quality
- Reliable printer operation

---

# Backup Recommendations

Recommended backup targets:

## Database

Backup:

```text
backend/data/
```

---

## Uploaded Photos

Backup:

```text
backend/uploads/
```

---

## Configuration Files

Backup:

```text
.env
```

Additional configuration:

```text
print-agent/
```

---

## Documentation

Backup:

```text
README.md
INSTALL.md
PRINT-SERVER.md
TROUBLESHOOTING.md
ADMINISTRATION.md
```

---

# Annual Camp Startup Checklist

Prior to camper arrival:

- Verify Backend starts
- Verify Frontend loads
- Verify Raspberry Pi is online
- Verify printer powers on
- Verify badge printing works
- Verify administrator login
- Verify system backups
- Verify sample visitor check-in
- Verify sample visitor badge print
- Verify adequate label inventory

---

# Annual Camp Shutdown Checklist

At season end:

- Export visitor records if required
- Verify backups exist
- Archive system documentation
- Update repository documentation
- Store printer supplies appropriately
- Record known issues for next season

---

# Change Management

Whenever changing:

- Printer settings
- Badge layouts
- Print Agent code
- Database schema
- Authentication settings

Always:

1. Test in a non-production scenario.
2. Perform a sample visitor check-in.
3. Perform a test print.
4. Update documentation.
5. Commit changes to GitHub.

---

# Support Escalation

Before investigating a problem, determine which component is failing:

| Symptom | Component |
|----------|----------|
| Kiosk page will not load | Frontend |
| Check-in fails | Backend |
| Badge not generated | Backend |
| Print job not created | Backend |
| Print job stuck | Print Agent |
| Printer not printing | Raspberry Pi / CUPS |
| Printer errors | Brother QL-800 |

Refer to `TROUBLESHOOTING.md` for diagnostic procedures.