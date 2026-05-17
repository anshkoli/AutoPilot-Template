import os
import threading
import time
import json
from http.server import BaseHTTPRequestHandler, HTTPServer

from fastapi.testclient import TestClient

from app.main import app


class EchoHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("content-length", 0))
        body = self.rfile.read(length)
        # respond with JSON echo
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        payload = {"ok": True, "received_len": len(body), "received_preview": body[:200].decode("utf-8", errors="replace")}
        self.wfile.write(json.dumps(payload).encode("utf-8"))


def run_echo_server(port: int = 9001):
    server = HTTPServer(("127.0.0.1", port), EchoHandler)
    server.serve_forever()


def test_malformed_multipart_is_proxied():
    # ensure app will proxy to local echo server
    os.environ["SUPERVITY_WORKFLOW_API_BASE"] = "http://127.0.0.1:9001"

    t = threading.Thread(target=run_echo_server, daemon=True)
    t.start()
    time.sleep(0.2)

    client = TestClient(app)

    body = b"--boundary\r\nContent-Disposition: form-data; name=\"data\"\r\n\r\n{\"data\":{\"primary_action\":\"approved\",\"feedback\":\"Looks good\"}}\r\n--boundary--\r\n"
    headers = {"Content-Type": "multipart/form-data"}  # missing boundary

    resp = client.post("/api/apex-marketing/reviews/form-123/submit", content=body, headers=headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data.get("submitted") is True
    assert data.get("raw", {}).get("ok") is True
