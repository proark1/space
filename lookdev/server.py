import os, http.server, socketserver

DIR = "/Users/assaddar/Documents/GitHub/space/lookdev"
PORT = 8173
os.chdir(DIR)

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()
    def log_message(self, *a):
        pass

with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
    print(f"lookdev serving on http://localhost:{PORT}/")
    httpd.serve_forever()
