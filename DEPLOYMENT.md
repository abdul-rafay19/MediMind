# Deploying MediMind — Step by Step

This gets you a **public GitHub repo** + a **live URL**, the two hard
requirements for submission. Budget ~1–2 hours.

You'll deploy two pieces:
- **Backend** (FastAPI + RAG + LLM + Firebase) → Render.com (free tier, supports Docker + long-running processes — Vercel's serverless model doesn't fit this app)
- **Frontend** (static HTML/CSS/JS) → Vercel or Netlify (either is fine, both are free)

---

## 0. Before anything: rotate your keys

Two real secrets exist in your local project right now:
- `backend/.env` → `OPENROUTER_API_KEY` (NVIDIA NIM key)
- `backend/serviceAccountKey.json` → Firebase private key

Because these were shared in this chat/session, treat them as exposed:
1. **NVIDIA key**: go to https://build.nvidia.com → account → API keys → revoke the old one → generate a new one. Put the new key in your local `.env` only.
2. **Firebase key**: Firebase Console → Project Settings → Service Accounts → generate a new private key. Delete the old key from the "Service accounts" list if it shows a manage option, or at minimum stop using the old file. Save the new file as `backend/serviceAccountKey.json` locally.

Neither file should ever be committed — the `.gitignore` added to this project already excludes them.

---

## 1. Push the code to a public GitHub repo

```bash
cd MediMind
git init
git add .
git status   # double check: .env, serviceAccountKey.json, medimind.db must NOT appear here
git commit -m "MediMind: AI-powered medical triage assistant"
```

Create a new **public** repo on GitHub (github.com/new → Public), then:

```bash
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/medimind.git
git push -u origin main
```

Open the repo in an incognito window to confirm it's public and doesn't require login.

---

## 2. Deploy the backend on Render

1. Go to https://render.com → sign up/log in with GitHub.
2. **New +** → **Blueprint** → select your `medimind` repo. Render will detect `render.yaml` at the repo root.
3. Render will ask you to fill in the env vars marked `sync: false`. Set:
   - `SECRET_KEY` → any long random string
   - `ALLOWED_ORIGINS` → leave as `["http://localhost:3000"]` for now, you'll update it after step 3
   - `OPENROUTER_API_KEY` → your **new** NVIDIA NIM key (starts with `nvapi-`)
   - `FIREBASE_CREDENTIALS_JSON` → open your new `serviceAccountKey.json`, copy the **entire file contents** as one line, paste it here
4. Click **Apply**. First build takes ~5–10 minutes (installs `sentence-transformers`, builds the RAG index on first boot).
5. Once live, Render gives you a URL like `https://medimind-backend.onrender.com`. Test it:
   ```
   https://medimind-backend.onrender.com/api/health
   ```
   You should get a JSON response, not an error.

> Free-tier Render services sleep after 15 minutes of inactivity and take ~30–50s to wake up on the next request. This is normal — mention it in your README so graders aren't confused by the first slow load.

### If you'd rather not use the Blueprint
Manually: New → Web Service → connect repo → Root Directory `backend` → Environment `Docker` → set the same env vars from `.env.example` in the Environment tab.

---

## 3. Point the frontend at your live backend

Edit `frontend/index.html`, find this block near the bottom:

```html
window.MEDIMIND_API_BASE_URL = null;
```

Change it to your real Render URL + `/api`:

```html
window.MEDIMIND_API_BASE_URL = "https://medimind-backend.onrender.com/api";
```

Commit and push this change.

---

## 4. Deploy the frontend on Vercel

1. Go to https://vercel.com → sign up/log in with GitHub.
2. **Add New** → **Project** → import your `medimind` repo.
3. Set **Root Directory** to `frontend`.
4. Framework preset: **Other** (it's a static site, no build step needed).
5. Deploy. Vercel gives you a URL like `https://medimind-yourname.vercel.app`.

(Netlify works identically if you prefer it: New site from Git → base directory `frontend` → no build command → publish directory `frontend`.)

---

## 5. Close the loop: update CORS

Go back to Render → your backend service → Environment → update:

```
ALLOWED_ORIGINS=["https://medimind-yourname.vercel.app"]
```

Save — Render will redeploy automatically. Without this step, the frontend's requests to the backend will be blocked by CORS.

---

## 6. Verify everything end to end

Open your Vercel URL in an incognito window and actually use the app:
- Register a new account
- Run a symptom check (try something mild like "sore throat and mild cough for 1 day" and something urgent like "severe chest pain and shortness of breath" — confirm the triage levels differ)
- Check history saves the session
- Try the medications/health profile CRUD screens
- Generate a PDF report

Take your 3+ screenshots **now**, while it's live, for the README.

---

## 7. Finish the README

Fill in the `<!-- TODO -->` markers in `README.md`:
- Live URL (both frontend and backend)
- Screenshots (drop image files in a `/screenshots` folder, reference them with `![alt](screenshots/file.png)`)

Commit, push, and submit the GitHub repo link.
