# Sample Data

This folder provides example quiz payloads produced during development. Each file is a direct `QuizResponse` JSON payload returned by the `/generate_quiz` endpoint.

## Files

- `world_wide_web.json` – Quiz generated from https://en.wikipedia.org/wiki/World_Wide_Web
- `alan_turing.json` – Quiz generated from https://en.wikipedia.org/wiki/Alan_Turing

Use these files to:
- Seed local databases for demos
- Validate schema changes without calling the live LLM
- Provide evidence of successful runs for review

> **Note:** Field values were trimmed for brevity but remain schema-compliant. Replace with fresh captures if you regenerate quizzes.
