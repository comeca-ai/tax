"""Real HTTP boundary tests, with an ephemeral loopback listener and no API calls."""
import http.client
import json
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from server import App, make_handler


class HTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.app = App(data_dir=cls.tmp.name, ai_enabled=False)
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), make_handler(cls.app))
        cls.port = cls.server.server_address[1]
        cls.app.origin = f'http://127.0.0.1:{cls.port}'
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()
        cls.tmp.cleanup()

    def call(self, method, path, body=None, cookie=None, origin=True, content_type='application/json'):
        conn = http.client.HTTPConnection('127.0.0.1', self.port, timeout=5)
        headers = {'Content-Type': content_type, 'X-Jampeiro-Request': '1'}
        if origin: headers['Origin'] = self.app.origin
        if cookie: headers['Cookie'] = cookie
        conn.request(method, '/jampeiro/'+path, body=body, headers=headers)
        response = conn.getresponse()
        result = response.status, dict(response.getheaders()), response.read()
        conn.close()
        return result

    def session(self):
        status, headers, _ = self.call('GET', 'api/session')
        self.assertEqual(status, 200)
        return headers['Set-Cookie'].split(';')[0]

    def test_static_allowlist_and_csp(self):
        for path in ('server.py', '../server.py', '%2e%2e/server.py', 'private/chat.sqlite3', '.env', 'screens/../../server.py'):
            self.assertEqual(self.call('GET', path)[0], 404)
        status, headers, body = self.call('GET', '')
        self.assertEqual(status, 200)
        self.assertIn(b'JhonemeJampeiro', body)
        self.assertIn("frame-ancestors 'none'", headers['Content-Security-Policy'])
        self.assertEqual(headers['Cache-Control'], 'no-store')
        self.assertEqual(json.loads(self.call('GET', 'knowledge.json')[2])['version'], '1.0.0')

    def test_auth_origin_validation_and_bad_payload(self):
        data = '{"message":"E12"}'
        self.assertEqual(self.call('POST', 'api/chat', data)[0], 401)
        cookie = self.session()
        self.assertEqual(self.call('POST', 'api/chat', data, cookie, origin=False)[0], 403)
        self.assertEqual(self.call('POST', 'api/chat', data, cookie, content_type='text/plain')[0], 415)
        self.assertEqual(self.call('POST', 'api/chat', '[]', cookie)[0], 400)
        self.assertEqual(self.call('POST', 'api/chat', '{"message":""}', cookie)[0], 400)
        self.assertEqual(self.call('POST', 'api/chat', 'x'*10001, cookie)[0], 413)

    def test_real_chat_persistence_isolation_delete(self):
        cookie = self.session()
        result = self.call('POST', 'api/chat', '{"message":"E12"}', cookie)
        self.assertEqual(result[0], 200)
        self.assertEqual(json.loads(result[2])['messages'][1]['cards'][0]['id'], 'E12')
        history = self.call('GET', 'api/session', cookie=cookie)
        self.assertEqual(len(json.loads(history[2])['messages']), 2)
        self.assertEqual(len(json.loads(self.call('GET', 'api/session', cookie=self.session())[2])['messages']), 0)
        self.assertEqual(self.call('DELETE', 'api/session', cookie=cookie)[0], 200)
        self.assertEqual(self.call('POST', 'api/chat', '{"message":"E12"}', cookie)[0], 401)

    def test_cookie_security(self):
        _, headers, _ = self.call('GET', 'api/session')
        cookie = headers['Set-Cookie']
        for flag in ('HttpOnly', 'SameSite=Strict', 'Path=/jampeiro/', 'Max-Age=2592000'):
            self.assertIn(flag, cookie)


if __name__ == '__main__':
    unittest.main()
