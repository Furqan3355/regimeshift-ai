"""
fake_session.py
----------------
A fake HTTP session that mimics requests.Session() behavior (both .get and
.post), so we can test data_ingestion.py without hitting the real Binance
API or needing real API keys.
"""


class FakeResponse:
    def __init__(self, json_data, status_code=200):
        self._json_data = json_data
        self.status_code = status_code
        self.text = str(json_data)

    def json(self):
        return self._json_data


class FakeSession:
    """
    Routes based on a keyword found in the URL, so tests can register
    canned responses per-endpoint without needing exact URL matching.
    """

    def __init__(self, responses: dict, status_code: int = 200):
        # responses: {"rwa/tokens": {...json...}, "candles": {...}, ...}
        self.responses = responses
        self.status_code = status_code
        self.calls = []  # records calls for assertions in tests

    def get(self, url, headers=None):
        self.calls.append({"method": "GET", "url": url, "headers": headers})
        return self._match(url)

    def post(self, url, headers=None, data=None):
        self.calls.append({"method": "POST", "url": url, "headers": headers, "data": data})
        return self._match(url)

    def _match(self, url):
        for keyword, payload in self.responses.items():
            if keyword in url:
                return FakeResponse(payload, self.status_code)
        return FakeResponse({"code": -1, "msg": "no route registered"}, status_code=404)