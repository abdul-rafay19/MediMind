# Deploying MediMind — Step by Step

This is the actual path used to deploy this project: **Railway** for the
backend (FastAPI + RAG + LLM + Firebase), **Vercel** for the static frontend.

## 0. Rotate your keys before anything is public

Never commit real secrets. Keep `OPENROUTER_API_KEY` and your Firebase
service account key only in Railway's environment variables, never in Git.

## 1. Push to a public GitHub repo

```bash
cd MediMind
git init
git add .
git status   # confirm .env / serviceAccountKey.json / medimind.db do NOT appear
git commit -m "MediMind: AI-powered medical triage assistant"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/MediMind.git
git push -u origin main
```
Check it's public by opening the repo URL in an incognito window.

## 2. Deploy the backend on Railway

1. https://railway.app → sign in with GitHub
2. **New Project** → **Deploy from GitHub repo** → select your repo
3. Service **Settings** → **Root Directory**: `backend` (Railway auto-detects the `Dockerfile`)
4. **Variables** tab → add these (via "Raw Editor"/bulk paste or one by one):
   ```
   SECRET_KEY=<a long random string>
   ALLOWED_ORIGINS=["http://localhost:3000"]
   OPENROUTER_API_KEY=<your NVIDIA NIM key>
   OPENROUTER_BASE_URL=https://integrate.api.nvidia.com/v1
   LLM_PRIMARY_MODEL=meta/llama-3.1-8b-instruct
   LLM_SECONDARY_MODEL=mistralai/mistral-7b-instruct-v0.3
   LLM_FALLBACK_MODEL=microsoft/phi-3-mini-4k-instruct
   LLM_MAX_TOKENS=1500
   LLM_TEMPERATURE=0.1
   CHROMA_PERSIST_DIR=./data/chroma_db
   KNOWLEDGE_BASE_DIR=./data/knowledge_base
   EMBEDDING_MODEL=all-MiniLM-L6-v2
   RAG_TOP_K=5
   ```
5. Add `FIREBASE_CREDENTIALS_JSON` **separately**, as its own variable — paste
   the entire raw contents of your `serviceAccountKey.json` file as the
   value. Double-check it actually saved (click into it and confirm it
   starts with `{"type": "service_account"...` and isn't blank).
6. **Settings** → **Networking** → **Generate Domain** to get a public URL.
7. Check the deploy logs for `✅ Firebase Firestore connected` and
   `✅ RAG ready`. Test `https://<your-domain>/api/health`.

## 3. Point the frontend at the live backend

In `frontend/index.html`, set:
```html
window.MEDIMIND_API_BASE_URL = "https://<your-railway-domain>/api";
```
Commit and push.

## 4. Deploy the frontend on Vercel

1. https://vercel.com → sign in with GitHub
2. **Add New** → **Project** → import your repo
3. **Root Directory**: `frontend`
4. Framework preset: **Other** (static site, no build step)
5. **Deploy** → you get a URL like `https://medimind-yourname.vercel.app`

## 5. Fix CORS

Back in Railway → Variables → update:
```
ALLOWED_ORIGINS=["https://medimind-yourname.vercel.app"]
```
Save (auto-redeploys).

## 6. Verify end to end + take screenshots

Open your Vercel URL in an incognito window:
- Register, run a symptom check on a mild case and a severe case (confirm
  different triage colors), check history, try medications/health profile
  CRUD, generate a PDF report.
- Take 3+ screenshots now, while it's live.

## 7. Finish the README

- Fill in the live URLs under section (b)
- Add screenshots to a `screenshots/` folder and reference them
- Commit, push, submit the repo link
