# Contributing

Alchemist OT Sandbox is designed to stay static, browser-local, and useful to OT engineers reviewing zones, conduits, and segmentation paths.

## Local Development

```bash
pnpm install
pnpm dev
```

Before opening a pull request:

```bash
pnpm lint
pnpm test
pnpm build
```

## Product Boundaries

- Keep project data local to the browser unless the user explicitly exports it.
- Do not add live scanning, exploitation, packet capture, or protocol emulation.
- Keep scoring language advisory. Do not claim ISA/IEC 62443 certification.
- Prefer explainable rules with clear remediation over opaque scoring changes.

## Useful Test Scenarios

- Flat IT/OT network.
- Correct IDMZ with historian replication.
- Direct vendor remote access to PLC.
- Isolated safety zone.
- Engineering workstation to controller path.
