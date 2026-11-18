# Security policy

## Reporting a vulnerability

Please do not open a public issue for security problems. Email **hello@quanticdata.io** with the subject "Security: quanticdata-node" and include:

- a description of the issue and its impact,
- steps to reproduce or a proof of concept,
- the SDK version and Node.js version.

We acknowledge reports within 3 business days and keep you informed until the fix is released. Please give us a reasonable time to fix the issue before disclosing it.

## Supported versions

| Version | Supported |
| --- | --- |
| 0.1.x | yes |

## API keys

Never commit an API key. The SDK reads `QUANTICDATA_API_KEY` from the environment and sends it only in the `Authorization` header. If a key leaks, rotate it on the API keys page of the dashboard.
