# PBC Visitor Kiosk System
## Version 0.1 Requirements

### Purpose

Provide a simple self-service visitor registration kiosk for use during summer camp weeks.

The primary use case is parents, grandparents, family members, pastors, approved guests, and vendors visiting camp for meals, chapel services, award ceremonies, and activities.

The system shall:

- Register visitors
- Capture visitor photos
- Print visitor badges
- Maintain a historical visitor log
- Provide office staff visibility into visitors currently on campus
- Support individual and bulk visitor checkout

---

# Goals

## G1 - Simple

A first-time visitor should be able to complete registration in less than 60 seconds.

## G2 - Volunteer Friendly

Camp office volunteers should require little or no training.

## G3 - Secure

Office staff should be able to quickly determine:

- Who is currently on campus
- Why they are visiting
- Which camper they are visiting

## G4 - Self-Hosted

The system must operate entirely on PBC infrastructure with no cloud subscription requirements.

---

# User Roles

## Visitor

Can:

- Register
- Take photo
- Print badge

Cannot:

- View visitor records
- Access administrative functions

## Office Staff

Can:

- View active visitors
- Search visitor history
- Check visitors out
- Reprint badges

## Administrator

Can:

- Configure system settings
- Manage camper roster imports
- View reports
- Export data

---

# Visitor Check-In Workflow

## Step 1 - Select Visitor Type

Visitor selects one of:

- Parent
- Grandparent
- Family Member
- Guest
- Pastor
- Vendor
- Other

---

## Step 2 - Enter Visitor Information

Required:

- First Name
- Last Name

Optional:

- Church
- Phone Number

---

## Step 3 - Identify Camper Being Visited

### Version 0.1

Manual entry:

- Camper First Name
- Camper Last Name

### Future Enhancement

- Camper roster lookup
- Search and select camper

---

## Step 4 - Capture Photo

Requirements:

- Use tablet camera
- Allow retake of photo
- Store photo with visitor record

---

## Step 5 - Review Information

Display:

- Visitor name
- Visitor type
- Camper being visited
- Photo

Visitor confirms information before proceeding.

---

## Step 6 - Print Badge

Visitor presses **Print Badge**.

Badge is printed automatically.

---

# Badge Requirements

Badge must contain:

- Visitor photo
- Full name
- Visitor type
- Camper name
- Date
- Time

Example:

```text
+-------------------------+
|         PHOTO           |
|                         |
| JOHN SMITH             |
| Parent Visitor         |
| Visiting: Jacob Smith  |
| Jul 12, 2026 5:15 PM   |
+-------------------------+
```

Initial printer target:

- Brother QL-800

---

# Active Visitor Dashboard

Office staff shall have access to a live dashboard displaying all visitors currently on campus.

## Fields

| Field | Description |
|---------|---------|
| Photo | Thumbnail |
| Name | Visitor Name |
| Visitor Type | Parent, Guest, Vendor, etc. |
| Camper | Camper Being Visited |
| Check-In Time | Timestamp |
| Duration | Time Since Check-In |
| Status | Active / Checked Out |

## Actions

- Check Out
- View Details
- Reprint Badge

---

# Individual Visitor Checkout

Office staff may manually check out a visitor.

System shall:

- Record checkout timestamp
- Remove visitor from Active Visitor list
- Retain visitor in historical records

---

# Bulk End-of-Event Checkout

Office staff may perform a bulk checkout of all active visitors.

Intended use cases:

- Parent dinner
- Awards ceremony
- Family night
- End of visiting hours

## Requirements

Provide a:

**Check Out All Active Visitors**

button on the dashboard.

System shall:

- Display confirmation prompt
- Record checkout timestamp for all active visitors
- Set checkout method to "Bulk Checkout"
- Remove visitors from Active Visitor list
- Preserve all historical visitor records

---

# Dashboard Metrics

Display:

- Active Visitors
- Visitors Checked In Today
- Visitors Checked Out Today
- Last Bulk Checkout Time

---

# Search Requirements

Office staff shall be able to search by:

- Visitor Name
- Camper Name
- Phone Number
- Date

---

# Reports

## Active Visitors

Displays all visitors currently on campus.

## Daily Visitor Log

Displays all visitors for a specific date.

## Camp Week Report

Displays all visitors during a selected camp week.

---

# Data Storage

Store:

- Visitor Information
- Visitor Photo
- Visitor Type
- Camper Information
- Check-In Time
- Check-Out Time
- Checkout Method
- Badge Information

### Retention

Version 0.1 shall retain records indefinitely.

Retention policies may be added in a future release.

---

# Hardware Requirements

## Kiosk Device

Supported devices:

- iPad
- Android Tablet
- Windows Touchscreen Device

Requirements:

- Web browser
- Camera

## Printer

Target printer:

- Brother QL-800

Printing should occur automatically through a local print service.

---

# Authentication

## Visitor Kiosk

No authentication required.

Kiosk operates in public self-service mode.

## Staff Console

Protected by a shared office password.

Role-based authentication is deferred to a future release.

---

# Non-Goals for Version 0.1

The following features are intentionally out of scope:

- Background checks
- Driver's license scanning
- QR code badges
- Badge scanning for checkout
- SMS notifications
- Email notifications
- Parent pickup authorization
- Camp registration system integration
- Camper roster synchronization
- Multiple campus locations
- Visitor pre-registration
- Recurring visitor recognition

---

# Success Criteria

Version 0.1 is considered successful when:

- Visitors can self-register without assistance
- Visitor photos are captured successfully
- Badges print automatically
- Office staff can view all active visitors
- Individual visitors can be checked out
- Bulk end-of-event checkout is available
- Visitor history remains searchable
- The solution runs entirely on PBC infrastructure
