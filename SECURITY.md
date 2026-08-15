# Security Policy

## Supported Versions

The PBC Visitor Kiosk follows semantic versioning. Security updates are provided
for the versions listed below. Please ensure you are running a supported release
before reporting a vulnerability.

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

Only the latest patch release within the `1.0.x` line receives security fixes.
When a vulnerability is confirmed, the fix is released as a new `1.0.x` patch
version. Users are strongly encouraged to update to the most recent patch
release as soon as it becomes available.

## Reporting a Vulnerability

We take the security of the PBC Visitor Kiosk seriously, especially given that it
handles visitor personal information and photographs. If you believe you have
found a security vulnerability, please report it to us privately. **Do not open a
public GitHub issue for security vulnerabilities.**

### How to Report

Please report vulnerabilities through one of the following channels:

- **GitHub Security Advisories** (preferred): Use the
  [Report a vulnerability](https://github.com/stemy-msft/PBC-Guest-Kiosk/security/advisories/new)
  button under the repository's **Security** tab to open a private advisory.
- **Email**: Send details to the repository maintainer via the contact address
  listed on the maintainer's GitHub profile.

### What to Include

To help us triage and resolve the issue quickly, please include as much of the
following as possible:

- A description of the vulnerability and its potential impact.
- The affected component (frontend, backend, print agent, or deployment).
- The version or commit hash where you observed the issue.
- Step-by-step instructions to reproduce the vulnerability.
- Any proof-of-concept code, screenshots, or logs (with sensitive data redacted).
- Any suggested remediation, if you have one.

### What to Expect

- **Acknowledgement**: We aim to acknowledge your report within **3 business days**.
- **Assessment**: We will investigate and provide an initial assessment, including
  severity and expected timeline, within **10 business days**.
- **Updates**: We will keep you informed of our progress as we work toward a fix.
- **Resolution**: Once a fix is available, we will release a patched `1.0.x`
  version and, where appropriate, publish a security advisory.

### Responsible Disclosure

We ask that you give us a reasonable opportunity to address the issue before any
public disclosure. We are committed to working with security researchers in good
faith and will not pursue or support legal action against anyone who reports a
vulnerability responsibly and in accordance with this policy.
