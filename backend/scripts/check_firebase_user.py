from firebase_admin import auth, credentials, initialize_app, get_app
import pathlib, sys
p = pathlib.Path(__file__).parent.parent / 'serviceAccountKey.json'
print('serviceAccount exists:', p.exists())
if not p.exists():
    sys.exit(1)
cred = credentials.Certificate(str(p))
try:
    initialize_app(cred)
except Exception:
    try:
        get_app()
    except Exception:
        pass

email = 'samad@gmail.com'
try:
    u = auth.get_user_by_email(email)
    print('FOUND in Firebase Auth:', u.uid, u.email)
    print('email_verified:', u.email_verified)
    print('disabled:', u.disabled)
    print('provider_data:', [pd.provider_id for pd in u.provider_data])
except Exception as e:
    print('Firebase Auth lookup failed or not found:', e)
    sys.exit(2)
