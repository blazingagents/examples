All changes must use a topic branch and merge through a PR after required checks pass. Never commit or push directly to `main`.

README.md is the repository's brief for Tenants: what it is, features, installation, a quick start, and links to the documentation. Document feature behavior on the documentation site (`blazingagents/docs`), not in the README.

Database integration tests run through the shared platform pool: `npm --prefix ../ba-platform run test:integration:examples`. Independent integration commands can run concurrently; a focused command fails clearly when the pool is full. See [pool configuration and concurrency rules](../ba-platform/docs/test-pool.md). Ordinary unit and protocol-fixture tests need no Supabase.
