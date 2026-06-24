# Security Policy

## Supported versions

Security fixes are provided for the latest published minor release. Before the
first stable release, only the latest `0.x` version is supported.

## Reporting a vulnerability

Use GitHub Private Vulnerability Reporting for this repository. Do not open a
public issue for suspected vulnerabilities.

Include:

- affected package and version;
- impact and attack prerequisites;
- a minimal reproduction;
- recommended mitigation, if known.

Do not include passwords, signing secrets, refresh tokens, cookies, production
storage files, customer data, or private infrastructure details.

## Security scope

Security-sensitive areas include:

- append-log and snapshot integrity;
- lock-file and backup behavior;
- query/body/rate limits;
- private-field handling;
- permissions and record policies;
- password hashing, access tokens, refresh-token rotation, and CSRF protection.

## Deployment warnings

Writable deployments require a persistent filesystem and exactly one writable
Node process per database path. Multi-server writes, ephemeral serverless storage,
raw live-folder backups, weak auth secrets, and publicly exposed diagnostic routes
are unsupported and unsafe.

Auth is optional, but permissions remain mandatory. Applications are responsible
for HTTPS, secret rotation, host security, dependency updates, and domain-specific
authorization policies.
