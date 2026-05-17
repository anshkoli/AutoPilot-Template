import os
import threading
import time
import json
from http.server import BaseHTTPRequestHandler, HTTPServer

from fastapi.testclient import TestClient


class EchoHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("content-length", 0))
        body = self.rfile.read(length)
        print("[proxy-server] Received request body:\n", body.decode("utf-8", errors="replace"))
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        payload = {"ok": True, "received_len": len(body)}
        self.wfile.write(json.dumps(payload).encode("utf-8"))


def run_echo_server(port: int = 9000):
    server = HTTPServer(("0.0.0.0", port), EchoHandler)
    server.serve_forever()


if __name__ == "__main__":
    # Ensure the app will proxy to our local echo server
    os.environ["SUPERVITY_WORKFLOW_API_BASE"] = "http://127.0.0.1:9000"

    # Start echo server in background thread
    t = threading.Thread(target=run_echo_server, daemon=True)
    t.start()
    time.sleep(0.5)

    # Import app and test client
    from app.main import app

    client = TestClient(app)

    # Malformed multipart: header missing boundary, body contains boundary markers
    body = b"--boundary\r\nContent-Disposition: form-data; name=\"data\"\r\n\r\n{\"data\":{\"primary_action\":\"approved\",\"feedback\":\"Looks good\"}}\r\n--boundary--\r\n"
    headers = {"Content-Type": "multipart/form-data"}  # missing boundary

    print("[test] Sending malformed multipart POST to /api/apex-marketing/reviews/form-123/submit")
    resp = client.post("/api/apex-marketing/reviews/form-123/submit", content=body, headers=headers)

    print("[test] Response status:", resp.status_code)
    try:
        print("[test] Response JSON:", resp.json())
    except Exception:
        print("[test] Response text:", resp.text)
