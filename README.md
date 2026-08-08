# Alchemist OT Sandbox

Alchemist OT Sandbox is a browser-only OT network architecture assessor for modelling Purdue-style zones, IEC 62443-style conduits, reachability, and segmentation risk.

The V1 production site is intended to be hosted on GitHub Pages at `https://alchemist.paracausaltelemetry.com/`.

## What It Does

- Build a logical OT topology with Purdue zone bands.
- Add assets such as enterprise IT, firewalls, jump hosts, historians, engineering workstations, HMIs, SCADA, PLCs, safety systems, field devices, wireless gateways, vendor remote access, and cloud services.
- Add conduits between assets with protocol, port, direction, firewall posture, inspection, logging, and ownership metadata.
- Visualise conduit protocols with transit-map style coloured lines.
- Show multiple conduits between the same two assets as separate side-by-side tracks.
- Test reachability between entry points and crown-jewel targets.
- Highlight attacker paths, trust-boundary crossings, broad rules, undocumented rules, and weak segmentation.
- Produce an advisory security rating, findings, remediation guidance, flow table, zone matrix, JSON export, SVG export, and printable report.

## What It Is Not

This is an architectural advisory tool. It is not:

- ISA/IEC 62443 certification.
- A vulnerability scanner.
- A packet capture tool.
- A protocol emulator.
- A cyber range.
- A replacement for engineering validation, change control, or safety review.

## Privacy Model

The app is static and browser-local:

- No accounts.
- No backend.
- No cloud project storage.
- No telemetry in V1.
- Project data is stored in browser localStorage.
- Data leaves the browser only when the user exports JSON, SVG, or print/PDF output.

## Local Development

```bash
pnpm install
pnpm dev
```

Useful commands:

```bash
pnpm lint
pnpm test
pnpm build
pnpm preview
```

## GitHub Pages Deployment

The production build is generated into `dist/`:

```bash
pnpm build
```

The repository deploys `dist/` through GitHub Actions using GitHub Pages. In the GitHub repository settings:

1. Set Pages source to GitHub Actions.
2. Set the custom domain to `alchemist.paracausaltelemetry.com`.
3. Enable Enforce HTTPS after GitHub provisions the certificate.

At the DNS provider, add:

```text
CNAME alchemist.paracausaltelemetry.com -> <owner>.github.io
```

Use the GitHub Pages owner or organization name only in the DNS target. Do not include the repository name. The app does not require server-side routes or an API.

## V1 Release Checklist

Before promoting a deployment:

```bash
pnpm lint
pnpm test
pnpm build
```

Then verify:

- The GitHub Pages workflow completes from `main`.
- `https://alchemist.paracausaltelemetry.com/` loads over HTTPS with no blank screen.
- JSON export, SVG export, and print/PDF report still work.
- Mobile width has no horizontal overflow, while the canvas workflow remains desktop/tablet-first.
- The main Paracausal Telemetry site links to Alchemist from its navbar.

## Guidance Anchors

The scoring and recommendations are informed by public OT security guidance, especially:

- NIST SP 800-82 Rev. 3, Guide to Operational Technology Security.
- NIST SP 800-82 Rev. 4 pre-draft direction.
- ISA/IEC 62443 zones, conduits, and security levels.
- MITRE ATT&CK for ICS.

These references are used as guidance anchors only. The app does not claim formal compliance or certification.

## Repository Notes

Do not commit:

- `node_modules/`
- `dist/`
- `*.tsbuildinfo`
- local browser/test artifacts
