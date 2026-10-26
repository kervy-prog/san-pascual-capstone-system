# Workspace Instructions

- Backend-first TypeScript project for Brgy. San Pascual, San Narciso, Zambales.
- Use Node.js, Express, Prisma, PostgreSQL, and Zod.
- Keep routes thin and place validation and business logic in dedicated modules.
- Run `npm run build` before considering backend changes complete.
- After finishing any code change and a passing build, automatically commit only the files you changed, with a clear message, and `git push` to `origin main`. Pushing to `main` auto-deploys to Vercel, so never push if the build fails. Never commit `.env` or other secrets.
