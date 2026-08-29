"""API contract tests driven by the deterministic MockBackend.

No llama.cpp / model / GPU is required: the app is created with BACKEND=mock,
so these tests exercise the full HTTP surface including validation, alignment,
backend management and the SSE stream endpoint.
"""

import json
import math
import os
import sys

import pytest
from fastapi.testclient import TestClient

# Make `import api` work when tests run from the repo root or server/.
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
os.environ.setdefault("BACKEND", "mock")   # deterministic, model-free backend

import api                                 # noqa: E402
from backends import REGISTRY, Capabilities  # noqa: E402


@pytest.fixture()
def client():
    with TestClient(api.app) as c:
        yield c


def post(c, path, body):
    r = c.post(path, json=body)
    return r.status_code, (r.json() if r.headers.get("content-type", "").startswith("application/json")
                           else r.text)


# ---------------------------------------------------------------- 4 endpoints

def test_health_fields(client):
    r = client.get("/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert data["backend"] == "mock"
    assert data["loaded"] is True
    assert data["nll_backend"] == "mock"
    assert data["max_input_tokens"] is None           # mock is unbounded
    assert data["max_char_count"] == api.MAX_CHAR_COUNT
    for k in ("model", "n_ctx", "n_vocab"):
        assert k in data


def test_ppl_structure_and_semantics(client):
    st, data = post(client, "/ppl", {"text": "Hello, world! 你好"})
    assert st == 200
    assert set(data) == {"average_ppl", "average_nll", "token_count", "char_count", "token_details"}
    n = data["token_count"]
    assert len(data["token_details"]) == n
    assert data["char_count"] == len("Hello, world! 你好")   # code-point count, not bytes
    first = data["token_details"][0]
    assert first["nll"] is None and first["ppl"] is None
    rest = data["token_details"][1:]
    assert all(t["nll"] is not None and t["ppl"] is not None for t in rest)
    # ppl == exp(nll), avg identities
    for t in rest:
        assert abs(t["ppl"] - math.exp(t["nll"])) < 1e-9
    avg = sum(t["nll"] for t in rest) / len(rest)
    assert abs(data["average_nll"] - avg) < 1e-9
    assert abs(data["average_ppl"] - math.exp(data["average_nll"])) < 1e-9
    # contiguous, covering offsets (mock is exact)
    co = [(t["char_start"], t["char_end"]) for t in data["token_details"]]
    assert co[0][0] == 0 and all(co[i][1] == co[i + 1][0] for i in range(n - 1))
    assert co[-1][1] == data["char_count"]


def test_two_step_equivalence_exact(client):
    text = "The quick brown fox jumps over the lazy dog."
    _, one = post(client, "/ppl", {"text": text})
    _, tok = post(client, "/tokenize", {"text": text})
    assert tok["tokens"] == [t["token_id"] for t in one["token_details"]]
    assert all(t["nll"] is None and t["ppl"] is None for t in tok["token_details"])
    assert tok["fits_ctx"] is True
    _, two = post(client, "/ppl_from_tokens", {"tokens": tok["tokens"], "text": text})
    assert two == one                              # every field, allowing for mock determinism
    # text only affects offsets: drop it -> values identical, char_count differs
    _, two_no_text = post(client, "/ppl_from_tokens", {"tokens": tok["tokens"]})
    assert two_no_text["average_nll"] == one["average_nll"]
    assert [t["nll"] for t in two_no_text["token_details"]] == [t["nll"] for t in one["token_details"]]


def test_tokenize_add_bos(client):
    _, no_bos = post(client, "/tokenize", {"text": "abc"})
    _, with_bos = post(client, "/tokenize", {"text": "abc", "add_bos": True})
    assert with_bos["tokens"] == [0] + no_bos["tokens"]     # mock BOS = id 0
    assert with_bos["fits_ctx"] is True


# ---------------------------------------------------------------- 400 / 422

def test_400_text_errors(client):
    for bad in ("", "   \n  "):
        st, data = post(client, "/ppl", {"text": bad})
        assert st == 400 and "detail" in data
    long_text = "x" * (api.MAX_CHAR_COUNT + 1)
    st, _ = post(client, "/ppl", {"text": long_text})
    assert st == 400
    st, _ = post(client, "/tokenize", {"text": long_text})
    assert st == 400


def test_400_token_errors(client):
    _, tok = post(client, "/tokenize", {"text": "ab"})
    assert len(tok["tokens"]) == 2
    st, data = post(client, "/ppl_from_tokens", {"tokens": [1]})
    assert st == 400 and "at least 2" in data["detail"]
    st, data = post(client, "/ppl_from_tokens", {"tokens": []})
    assert st == 400
    # out of range: mock vocab upper bound is 0x110000
    st, data = post(client, "/ppl_from_tokens", {"tokens": [0, 0x110000]})
    assert st == 400 and "[0, 1114112)" in data["detail"]
    st, data = post(client, "/ppl_from_tokens", {"tokens": [0, -3]})
    assert st == 400


def test_422_validation(client):
    for path, body in [("/ppl", {}), ("/ppl", {"text": None}), ("/ppl", {"text": 123}),
                       ("/ppl_from_tokens", {}),
                       ("/ppl_from_tokens", {"tokens": [0, 1.5]}),
                       ("/ppl_from_tokens", {"tokens": "ab"})]:
        st, data = post(client, path, body)
        assert st == 422


# ------------------------------------------------------------- backend mgmt

def test_backend_list_and_unload_cycle(client):
    r = client.get("/backends")
    assert r.status_code == 200
    data = r.json()
    assert data["current"] == "mock" and data["loaded"] is True
    assert "mock" in data["available"] and "llamacpp" in data["available"]

    # unload -> business endpoints 503
    r = client.post("/backends/mock/unload")
    assert r.status_code == 200 and r.json()["loaded"] is False
    st, data = post(client, "/ppl", {"text": "hi"})
    assert st == 503
    st, data = post(client, "/ppl_from_tokens", {"tokens": [97, 98]})
    assert st == 503

    # reload -> works again
    r = client.post("/backends/mock/load", json={})
    assert r.status_code == 200 and r.json()["loaded"] is True
    st, _ = post(client, "/ppl", {"text": "hi"})
    assert st == 200


def test_backend_unknown_id_and_not_loaded_unload(client):
    r = client.post("/backends/nope/load", json={})
    assert r.status_code == 404
    r = client.post("/backends/nope/unload")
    assert r.status_code == 404


def test_unload_501_declared_unsupported(client):
    # A mock instance that declares it cannot unload (covers the 501 path
    # without needing a new entry in api._build_backend).
    b = REGISTRY["mock"]()
    b._caps = Capabilities(max_input_tokens=None, supports_streaming=False,
                           supports_unload=False)
    b.load()
    api.current_backend = b
    try:
        r = client.post("/backends/mock/unload")
        assert r.status_code == 501 and "does not support unloading" in r.json()["detail"]
        # still loaded and serving
        st, _ = post(client, "/ppl", {"text": "ok"})
        assert st == 200
    finally:
        api.current_backend = None


# ------------------------------------------------------------------- stream

def _read_sse(client, path, body):
    events = []
    with client.stream("POST", path, json=body) as r:
        assert r.status_code == 200
        for line in r.iter_lines():
            line = (line or "").strip()
            if line.startswith("data: "):
                events.append(json.loads(line[len("data: "):]))
    return events


def test_stream_equivalence_with_batch(client):
    _, tok = post(client, "/tokenize", {"text": "streaming test 流式"})
    _, batch = post(client, "/ppl_from_tokens", {"tokens": tok["tokens"], "text": "streaming test 流式"})
    events = _read_sse(client, "/ppl_from_tokens/stream",
                       {"tokens": tok["tokens"], "text": "streaming test 流式"})

    n = tok["token_count"]
    assert events[0]["token_index"] == 0
    assert events[0]["nll"] is None
    # per-token events match the batch response exactly
    for i in range(1, n):
        ev = events[i]
        bd = batch["token_details"][i]
        assert ev["token_index"] == i
        assert ev["nll"] == bd["nll"]
        assert ev["ppl"] == bd["ppl"]
        assert ev["token_text"] == bd["token_text"]
        assert ev["char_start"] == bd["char_start"]
    final = events[-1]
    assert final["average_nll"] == batch["average_nll"]
    assert final["average_ppl"] == batch["average_ppl"]
    assert final["token_count"] == n
    assert len(events) == n + 1                         # null first + (n-1) + summary


def test_stream_error_as_sse_event(client):
    # too few tokens -> a detail event, HTTP 200 (SSE error contract)
    events = _read_sse(client, "/ppl_from_tokens/stream", {"tokens": [1]})
    assert events and "detail" in events[0]
    # out-of-range token id
    events2 = _read_sse(client, "/ppl_from_tokens/stream", {"tokens": [0, 0x110000]})
    assert events2 and "detail" in events2[0]