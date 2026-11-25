# Security Policy

## Self-Hosting Best Practices

- Run `./scripts/setup.sh` before deploying beyond `localhost` so that default local-dev Postgres passwords and JWT secrets are replaced with freshly generated random secrets.
- Never commit `.env` or `.env.local` files to version control.
- By default, local Docker Compose enables `GOTRUE_MAILER_AUTOCONFIRM=true` for frictionless single-machine hobby use. If you expose your instance to the public internet, configure SMTP and set `GOTRUE_MAILER_AUTOCONFIRM=false` (or `GOTRUE_DISABLE_SIGNUP=true` for a private single-user instance).

## Reporting a Vulnerability

If you discover a security vulnerability, please avoid opening a public issue with exploit details. Instead, report it privately via GitHub Security Advisories or contact the repository maintainer directly.
