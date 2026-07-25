# Firebase Setup — Step by Step

## Step 1: Create a Firebase Project

1. Go to **https://console.firebase.google.com**
2. Click **"Add project"**
3. Name it: `MediMind` (or anything you like)
4. Disable Google Analytics (not needed) → **Create project**
5. Wait ~30 seconds for it to set up

---

## Step 2: Enable Firestore Database

1. In your Firebase project, click **"Firestore Database"** in the left sidebar
2. Click **"Create database"**
3. Choose **"Start in production mode"** → click Next
4. Select a location closest to you (e.g. `europe-west1` or `us-central`) → **Enable**
5. Wait for Firestore to initialize (takes ~1 minute)

---

## Step 3: Set Firestore Security Rules

1. In Firestore → click the **"Rules"** tab
2. Replace all the text with this:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

3. Click **Publish**

> This locks the database completely — all access goes through your Python backend
> using the Admin SDK, which bypasses these rules. Your data is safe.

---

## Step 4: Download Your Service Account Key

1. Click the **gear icon** (top-left) → **"Project settings"**
2. Click the **"Service accounts"** tab
3. Make sure **"Firebase Admin SDK"** is selected and **Python** is selected
4. Click **"Generate new private key"** → **"Generate key"**
5. A JSON file downloads automatically (named something like `medimind-firebase-adminsdk-xxx.json`)
6. **Rename it to:** `serviceAccountKey.json`
7. **Move it into:** `medimind/backend/serviceAccountKey.json`

---

## Step 5: Run the Backend

```bash
cd medimind/backend
venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

You should see:
```
INFO: Database tables initialized    ← SQLite (users/auth only)
INFO: ✅ Firebase Firestore connected ← Your real database
INFO: RAG ready
INFO: ✅ MediMind ready!
```

---

## Step 6: Verify Firestore is Receiving Data

1. Register an account in MediMind
2. Do a triage analysis
3. Go to **Firebase Console → Firestore Database**
4. You should see a `triage_sessions` collection with your data inside

---

## Firestore Collections Structure

```
triage_sessions/
  {auto-id}/
    user_id: "1"
    chief_complaint: "..."
    triage_level: "URGENT"
    created_at: "2025-05-04T..."
    symptoms_extracted: {...}
    ...

medications/
  {auto-id}/
    user_id: "1"
    name: "Paracetamol"
    dosage: "500mg"
    ...

health_profiles/
  {user_id}/         ← document ID = user's SQLite ID
    blood_group: "O+"
    height_cm: 175
    ...

medical_notes/
  {auto-id}/
    user_id: "1"
    title: "Blood test results"
    content: "..."
    ...
```

---

## Cost

Firebase Firestore **free tier (Spark plan)** gives you:
- **50,000 reads/day**
- **20,000 writes/day**
- **20,000 deletes/day**
- **1 GB storage**

For a portfolio project or personal use this is **completely free forever**.
You only pay if you exceed these limits, which requires thousands of users.
