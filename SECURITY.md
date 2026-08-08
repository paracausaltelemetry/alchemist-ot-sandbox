# Security Policy

Alchemist OT Sandbox is a browser-local architectural advisory tool. It does not perform live scanning, packet capture, exploitation, or protocol emulation.

## Reporting Vulnerabilities

Please report security issues privately to Paracausal Telemetry before public disclosure. Include reproduction steps, affected version or commit, and impact.

## Data Handling

Projects are stored in browser localStorage and exported only when the user chooses JSON, SVG, or print/PDF export. The app has no backend, accounts, cloud project storage, or telemetry in the public beta.

## Scope

In scope:
- Client-side vulnerabilities in the static app.
- Import/export parsing issues.
- Misleading security findings caused by application logic.

Out of scope:
- Findings against third-party static hosts.
- Social engineering.
- Live OT network testing.
