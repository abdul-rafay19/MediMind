import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))
from fastapi.testclient import TestClient
from app.main import app
client = TestClient(app)

for email, password in [('samad@gmail.com', '123456'), ('love@gmail.com','123456')]:
    resp = client.post('/api/auth/login', json={'email': email, 'password': password})
    print(email, resp.status_code, resp.json())
