# V1 Release Runbook

## Repository

- Public repository: `alchemist-ot-sandbox`.
- Default branch: `main`.
- Repository root: this directory.
- Do not commit `node_modules/`, `dist/`, `*.tsbuildinfo`, local browser artifacts, or test reports.

## GitHub Pages

1. Push `main` to GitHub.
2. In repository settings, set Pages source to GitHub Actions.
3. Configure the custom domain as `alchemist.paracausaltelemetry.com`.
4. Wait for certificate provisioning, then enable Enforce HTTPS.
5. Confirm the `CI and Pages` workflow deploys successfully.

## DNS

Create a DNS CNAME record:

```text
alchemist.paracausaltelemetry.com CNAME <owner>.github.io
```

The target is the GitHub Pages owner or organization domain, without `/alchemist-ot-sandbox`.

## Main Site Handoff

Update the main Paracausal Telemetry site in its own repository:

- Add a navbar item or button labelled `Alchemist`.
- Link it to `https://alchemist.paracausaltelemetry.com/`.
- Open it in the same tab unless the existing site pattern uses a new tab for product tools.

## Acceptance Checks

Run locally:

```bash
pnpm lint
pnpm test
pnpm build
```

Verify production:

- The app loads over HTTPS.
- Browser console has no app errors.
- JSON export downloads the current project.
- SVG export downloads a readable topology.
- Print / save PDF includes score, assumptions, findings, and remediation.
- A 390px-wide viewport has no horizontal overflow.
