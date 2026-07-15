# Raspberry Pi Print Server Setup

This guide documents the tested print server configuration used by PBC Visitor Kiosk.

## Hardware

Tested configuration:

- Raspberry Pi 3B
- Raspberry Pi OS Lite (64-bit)
- Brother QL-800
- USB connection

## Install Required Packages

Install required packages:

```bash
sudo apt update
sudo apt install cups git python3 python3-venv
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

Log out and back in for group membership changes to take effect.

---

## Printer Driver Options

Two driver paths were tested successfully.

### Option 1: ptouch-ql Driver (Simplicity)

The open-source ptouch-ql driver is easier to install and works well for most deployments.

Install the driver:

```bash
sudo apt update
sudo apt install printer-driver-ptouch
```

#### Advantages

- Open source
- Simple installation
- No proprietary Brother software required
- Reliable badge printing

#### Disadvantages

- Badge photos exhibit visible halftoning/dithering
- Lower photo quality than the Brother driver

Recommended for environments where simplicity and ease of maintenance are more important than photo quality.

### Option 2: Brother Driver (Best Badge Quality)

The Brother driver provided the highest badge photo quality during testing.

Download the QL-800 Raspberry Pi / Raspbian Lite driver from the Brother support site.
https://support.brother.com/g/b/downloadlist.aspx?c=us&lang=en&prod=lpql800eus&os=10042

Install the driver:

```bash
sudo apt install ./ql800pdrv-2.1.4-0.armhf.deb
```

#### Advantages

- Better grayscale rendering
- Reduced halftoning
- Better photo quality
- Closest match to Windows-generated badge output

#### Disadvantages

- More complex installation
- Requires proprietary Brother software

#### Tested Packages

```text
ql800pdrv-2.1.4-0.armhf.deb
```

Recommended when badge photo quality is important.

---

## Create Printer Queue

Before creating a queue, verify that CUPS can see the printer.

Discover connected printers:

```bash
lpinfo -v
```

Expected output similar to:

```text
direct usb://Brother/QL-800?serial=000C8Z896885
```

View available printer definitions:

```bash
lpinfo -m | grep -i ql
```

### Create ptouch-ql Queue

Create the printer queue:

```bash
sudo lpadmin \
  -p QL800 \
  -E \
  -v usb://Brother/QL-800?serial=000C8Z896885
```

Verify queue creation:

```bash
lpstat -p
```

Expected output:

```text
printer QL800 is idle. enabled since Tue 14 Jul 2026 20:20:05 EDT
```

Print a test page:

```bash
lp -d QL800 /usr/share/cups/data/testprint
```

### Create Brother Driver Queue

Verify the Brother PPD exists:

```bash
find /usr/share -iname "*ql800*.ppd"
```

Create the Brother queue:

```bash
sudo lpadmin \
  -p QL800_BROTHER \
  -E \
  -v usb://Brother/QL-800?serial=000C8Z896885 \
  -P /usr/share/ppd/Brother/brother_ql800_printer_en.ppd
```

Verify queue creation:

```bash
lpstat -p
```

Expected output:

```text
printer QL800_BROTHER is idle. enabled since Tue 14 Jul 2026 20:20:05 EDT
```

---

## Brother Driver Recommended Settings

The following settings were determined through testing and are recommended for production use.

Apply settings:

```bash
sudo lpadmin -p QL800_BROTHER -o PageSize=62x100
sudo lpadmin -p QL800_BROTHER -o BrPriority=BrQuality
sudo lpadmin -p QL800_BROTHER -o BrBrightness=15
```

Verify settings:

```bash
lpoptions -p QL800_BROTHER
```

---

## Important Notes

### Page Size

The printer must use:

```text
62x100
```

Using the default:

```text
29x90
```

caused printer error states and failed badge prints during testing.

### Image Quality

#### ptouch-ql Driver

- Easier installation
- Reliable operation
- Good badge output
- Visible halftoning in photos

#### Brother Driver

- Better photo rendering
- Reduced halftoning
- Improved grayscale quality for visitor badges

---

## Print Test

Print a CUPS test page:

```bash
lp -d QL800_BROTHER /usr/share/cups/data/testprint
```

Print a badge image:

```bash
lp -d QL800_BROTHER badge.png
```

Monitor queued jobs:

```bash
lpstat -o
```

View printer status:

```bash
lpstat -p
```

Cancel queued jobs:

```bash
cancel QL800_BROTHER
```

---

## Print Agent Location

The Print Agent runs on the Raspberry Pi print server and is responsible for:

- Polling the backend for pending print jobs
- Downloading badge images
- Submitting print jobs to CUPS
- Reporting print status back to the backend

Configure the queue used by the Print Agent:

### Brother Driver

```env
PBC_PRINTER_NAME=QL800_BROTHER
```

### ptouch-ql Driver

```env
PBC_PRINTER_NAME=QL800
```

---

## Verification Reference Information

### Installed Brother Driver Version

Verify the installed Brother driver version:

```bash
dpkg -s ql800pdrv | grep Version
```

Expected output:

```text
Version: 2.1.4-0
```

### Brother Components

Verify the Brother CUPS filter is installed:
 
```
bashls -l /usr/lib/cups/filter/brother_lpdwrapper_ql800
```
 
Expected output similar to:
 
```
text-rwxr-xr-x 1 root root ###### /usr/lib/cups/filter/brother_lpdwrapper_ql800
```
 
Verify the Brother PPD is installed:
 
```
bashfind /usr/share -iname "*ql800*.ppd"
```
 
Expected output:
 
```
text/usr/share/ppd/Brother/brother_ql800_printer_en.ppd/usr/share/cups/model/Brother/brother_ql800_printer_en.ppd
```

### Printer Device URI

Verify the printer is detected by CUPS:

```bash
lpstat -v
```

Known-good output:

```text
device for QL800: usb://Brother/QL-800?serial=000C8Z896885
device for QL800_BROTHER: usb://Brother/QL-800?serial=000C8Z896885
```

> Serial numbers will differ between printers.

### Installed Queues

Verify configured queues:

```bash
lpstat -p
```

Expected output:

```text
printer QL800 is idle. enabled since Tue 14 Jul 2026 18:44:47 EDT
printer QL800_BROTHER is idle. enabled since Tue 14 Jul 2026 18:44:47 EDT
```

### Brother Queue Settings

Verify queue configuration:

```bash
lpoptions -p QL800_BROTHER
```

Known-good production settings:

```text
PageSize=62x100
BrPriority=BrQuality
BrBrightness=15
```

---

## Rebuild Checklist

To recreate a known-good print server:

1. Install Raspberry Pi OS Lite (64-bit)
2. Install required packages
3. Install selected printer driver
4. Create printer queue
5. Verify CUPS printing
6. Install PBC Visitor Kiosk Print Agent
7. Configure `PBC_PRINTER_NAME`
8. Print a test badge
9. Verify successful iPad check-in to printed badge workflow

---

## Configuration Validated July 2026

### Hardware

- Raspberry Pi 3B
- Raspberry Pi OS Lite (64-bit)
- Brother QL-800
- DK-2205 Continuous Labels

### Software

- CUPS 2.x
- Python Print Agent
- Brother ql800pdrv-2.1.4-0.armhf.deb

### Production Queue

```text
QL800_BROTHER
```

### Production Settings

```text
PageSize=62x100
BrPriority=BrQuality
BrBrightness=15
```

### Tested Workflow

The following workflow was successfully validated:

- iPad check-in
- Photo capture
- Badge generation
- Print job creation
- Print Agent polling
- Badge image download
- Automatic badge printing

This configuration is considered the known-good production setup.