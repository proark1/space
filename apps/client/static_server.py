import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlparse

ROOT = os.environ.get("STATIC_ROOT") or os.getcwd()
PORT = int(os.environ.get("PORT", "8080"))
HOST = os.environ.get("HOST", "0.0.0.0")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)
        request_path = unquote(parsed.path)
        local_path = os.path.join(ROOT, request_path.lstrip("/"))
        basename = os.path.basename(request_path)

        # Vite is a single-page app. Serve index.html for direct route loads
        # such as /admin, while preserving normal 404 behavior for asset files.
        if request_path != "/" and not os.path.exists(local_path) and "." not in basename:
            self.path = "/index.html"

        return super().do_GET()

    def log_message(self, fmt, *args):
        print("%s - %s" % (self.address_string(), fmt % args), flush=True)


ThreadingHTTPServer.allow_reuse_address = True
print(f"Serving SIGNAL LOST client from {ROOT} on http://{HOST}:{PORT}", flush=True)
ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
