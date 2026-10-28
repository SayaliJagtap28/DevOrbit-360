# DevOrbit 360

DevOrbit 360 is a MERN career workspace with account sign-in, MongoDB persistence, resume analysis, and a role-based learning roadmap. The browser app is in `client/`; the Express API and MongoDB models are in `server/`.

## Run locally

1. Install Node.js 18 or newer and create a MongoDB Atlas cluster.
2. In Atlas, add your current IP address to Network Access and create a database user.
3. Copy `.env.example` to `.env` and set `MONGODB_URI` to your Atlas connection string. Set `JWT_SECRET` to a long random value. To enable AI resume feedback, choose `AI_PROVIDER=openai` with `OPENAI_API_KEY`, or `AI_PROVIDER=gemini` with `GEMINI_API_KEY`. For Gemini, the server retries 503 responses and then tries `GEMINI_FALLBACK_MODEL`. Keep API keys in `.env`, never in client files.
4. Install the server packages and start the API plus frontend:

   ```powershell
   npm run install:server
   npm start
   ```

5. Open `http://localhost:3000`.

The root `.env` is read by the server. The first startup creates the preserved Alex Kim demo account when it does not already exist:

- Email: `alex.kim@example.com`
- Password: `Demo123!`

New sign-ups receive a fresh workspace. The demo account starts with the sample projects, profile, certifications, and roadmap data.

## Resume review

Sign in, open **Resume studio**, choose a PDF, DOCX, or TXT file, select a target role, and agree to upload it. The server stores the uploaded file in `uploads/`, extracts its text, identifies skills, and creates a learning roadmap from role skill gaps. Set `AI_PROVIDER=openai` and `OPENAI_API_KEY`, or `AI_PROVIDER=gemini` and `GEMINI_API_KEY`, to generate resume-specific feedback. Gemini uses Google's OpenAI-compatible chat endpoint; set `GEMINI_MODEL` to a model available to your API key. See [Google's compatibility guide](https://ai.google.dev/gemini-api/docs/openai). Without a configured key, the built-in analyzer still finds known skills and provides a role-based roadmap. Image-only PDFs need OCR before upload. Resume files and workspace data are private to the authenticated account; do not expose the `uploads/` directory with a static host.

## API overview

- `POST /api/auth/signup` and `POST /api/auth/login`
- `GET /api/workspace` and `PUT /api/workspace` (Bearer token required)
- `POST /api/chat` (Bearer token required; uses the configured AI provider)
- `POST /api/resume/analyze` and `GET /api/resume/:id` (Bearer token required)
- `GET /api/health`

The demo workspace remains available in the frontend seed as well as the initial MongoDB demo account. User workspaces are persisted to MongoDB after sign-in. Configure a strong JWT secret, keep `.env` private, and use HTTPS for deployment.
