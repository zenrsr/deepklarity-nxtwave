# DeepKlarity AI Wiki Quiz Generator

This repository implements the DeepKlarity full-stack assignment: generate structured quizzes from Wikipedia articles using a FastAPI backend, LangChain + Gemini for LLM orchestration, and a React/Tailwind frontend. The project now aligns with the reference specification documents in both functionality and deliverables.

## Project Structure

```
├── backend/                 # FastAPI service, database, scraping, LLM integration
├── frontend/                # React + Vite single-page app
├── docs/                    # Supporting documentation (prompts, screenshots)
├── sample_data/             # Example inputs/outputs for evaluation
└── README.md
```

## Prerequisites

- **Python 3.11+** (matches FastAPI + async stack tested locally)
- **Node.js 20.19+** and **npm 10+** (required by Vite; see build warning if older)
- **PostgreSQL 14+** (default connection `postgresql+asyncpg://postgres:postgres@localhost:5433/aiquiz`)
- Gemini API key for quiz generation (fallback rule-based generator kicks in if the key is missing or rate-limited)

## Backend Setup

1. Create and activate a virtual environment inside `backend/`:
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate  # Windows: venv\Scripts\activate
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Configure environment variables by copying `.env.example` to `.env` and updating values:
   ```env
   DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5433/aiquiz
   GEMINI_API_KEY=your_api_key
   GEMINI_MODEL=models/gemini-2.5-flash
   ```
4. Apply database migrations (SQLAlchemy auto-creates tables on startup).
5. Run the API:
   ```bash
   uvicorn app.main:app --reload
   ```

### Key Endpoints

- `POST /generate_quiz` – scrape Wikipedia, generate quiz, persist result
- `GET /quiz/{quiz_id}` – retrieve a stored quiz
- `GET /history` – list recent quizzes (paged)
- `POST /grade` – grade a submitted quiz attempt (bonus requirement)
- `GET /health` – readiness probe

## Frontend Setup

1. Install dependencies:
   ```bash
   cd frontend
   npm install
   ```
2. Provide environment variables (optional) in `frontend/.env`:
   ```env
   VITE_API_BASE_URL=http://127.0.0.1:8000
   VITE_REQUEST_TIMEOUT_MS=30000
   VITE_GENERATE_TIMEOUT_MS=90000
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
4. Build for production / type-check:
   ```bash
   npm run build
   ```

## Testing

- Backend smoke tests are available via `python -m unittest tests/test_backend.py` (requires running API instance).
- Frontend builds (`npm run build`) perform TypeScript checks and Vite bundling.
- Manual regression recommendation: generate quiz → view history → open details modal → grade quiz.

## Documentation & Assets

- Prompt templates and LLM guardrails: [`docs/prompt_templates.md`](docs/prompt_templates.md)
- Screenshots required by the assignment: see [`docs/screenshots/`](docs/screenshots/README.md)
- Sample datasets: [`sample_data/`](sample_data/README.md)

## Sample Data

`sample_data/` contains serialized quiz payloads for tested Wikipedia URLs. Use them to validate schema compatibility or seed the database.

## Notes & Known Limitations

- Gemini API access is required for high-quality quizzes; fallback heuristics deliver schema-compliant but less nuanced questions.
- The scraper now uses `requests` + BeautifulSoup as mandated. Network timeouts inherit `REQUEST_TIMEOUT_SECONDS` from settings.
- Screenshots supplied in `docs/screenshots/` are labeled placeholders; capture updated UI images after running the app locally.

## License

This repository is provided for the DeepKlarity assessment; no explicit license is attached.
