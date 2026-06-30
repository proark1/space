import json, os, http.server, socketserver, urllib.parse

DIR = "/Users/assaddar/Documents/GitHub/space/lookdev"
PORT = 8173
os.chdir(DIR)

ROUTES = {
    "/game": "/index.html",
    "/game/": "/index.html",
    "/lobby": "/lobby.html",
    "/lobby/": "/lobby.html",
    "/launch": "/launch.html",
    "/launch/": "/launch.html",
    "/pad": "/pad.html",
    "/pad/": "/pad.html",
    "/dock": "/dock.html",
    "/dock/": "/dock.html",
    "/exterior": "/exterior.html",
    "/exterior/": "/exterior.html",
    "/units": "/units.html",
    "/units/": "/units.html",
}

class Handler(http.server.SimpleHTTPRequestHandler):
    def route_request(self):
        parsed = urllib.parse.urlsplit(self.path)
        route = ROUTES.get(parsed.path)
        if route:
            self.path = route + (("?" + parsed.query) if parsed.query else "")
        return parsed

    def do_GET(self):
        parsed = self.route_request()
        if parsed.path == "/api/units":
            data = json.dumps({"items": []}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        super().do_GET()

    def do_HEAD(self):
        self.route_request()
        super().do_HEAD()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()
    def log_message(self, *a):
        pass

class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True

with ReusableTCPServer(("127.0.0.1", PORT), Handler) as httpd:
    print(f"lookdev serving on http://localhost:{PORT}/")
    httpd.serve_forever()
