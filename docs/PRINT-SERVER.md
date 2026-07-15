# Raspberry Pi Print Server Setup

This guide documents the tested print server configuration used by the PBC Visitor Kiosk.

---

# Hardware

Tested configuration:

- Raspberry Pi 4
- Raspberry Pi OS
- Brother QL-800
- USB connection

---

# Install Required Packages

```bash
sudo apt update
sudo apt install cups git python3-venv
```

Enable CUPS:

```bash
sudo systemctl enable cups
sudo systemctl start cups
```

Add the current user to the printer administration group:

```bash
sudo usermod -aG lpadmin $USER
```

Log out and back in.

---

# Install Brother Driver

The following Brother driver packages were used during testing:

```text
ql800pdrv-2.1.4-0.armhf.deb
Brother CUPS Wrapper Driver
```

Install according to Brother's instructions.

---

# Create Printer Queue

The production queue is:

```text
QL800_BROTHER
```

Verify queue:

```bash
lpstat -p
```

---

# Critical Queue Settings

These settings were determined through extensive testing.

Set queue defaults:

```bash
sudo lpadmin -p QL800_BROTHER -o PageSize=62x100
sudo lpadmin -p QL800_BROTHER -o BrPriority=BrQuality
sudo lpadmin -p QL800_BROTHER -o BrBrightness=15
```

---

# Important Notes

## Page Size

The printer must use:

```text
62x100
```

Using the default:

```text
29x90
```

caused printer error states and failed badge prints.

---

## Image Quality

The open-source ptouch-ql path worked but produced visible halftoning.

The Brother queue provided:

- Better photo quality
- Better grayscale rendering
- Less visible dithering
- More professional badges

---

# Print Test

Print a test page:

```bash
lp -d QL800_BROTHER /usr/share/cups/data/testprint
```

Print a badge image:

```bash
lp -d QL800_BROTHER badge.png
```

---

# Print Agent Integration

The print agent should be configured to use:

```env
PBC_PRINTER_NAME=QL800_BROTHER
```

This allows automatically generated visitor badges to print through the optimized Brother driver path.

---

# Tested Workflow

Successfully validated:

- Raspberry Pi print server
- Backend API
- Print agent polling
- Badge download
- Badge printing
- iPad visitor check-in
- Automatic badge generation
- Automatic badge printing

This configuration is considered the known-good production setup.