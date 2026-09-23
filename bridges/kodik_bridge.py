#!/usr/bin/env python3
"""
kodik_bridge.py v2 — локальный Python-bridge Kodik (порт 8765).

Боевая схема оригинала, воспроизведённая полностью:
  anime-parsers-ru (KodikParser, авто-пул токенов) → поиск по shikimori_id
  → with_episodes=true → seasons[*].episodes[*] → точный episode
  → episode-specific embed /seria/<id>/<hash>/720p для каждой озвучки.

Контракт для Next.js:
  GET  /health  → { "ok": bool, "reason": str }
  POST /resolve → { "provider": "kodik", "context": ProviderContext }
       → { "sources": [{translationId,label,kind,embedUrl,type}] } | { "error": str }

Установка:  pip install https://github.com/YaNesyTortiK/AnimeParsers/archive/refs/heads/main.zip
Запуск:     python bridges/kodik_bridge.py        (порт: KODIK_BRIDGE_PORT, по умолчанию 8765)
Совместимость: Python 3.11+ (встроен compat-загрузчик модуля parser_kodik).
"""
import json
import os
import time
import importlib.util
import sys
import types
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import requests

PORT = int(os.environ.get("KODIK_BRIDGE_PORT", "8765"))
API = os.environ.get("KODIK_API_BASE_URL", "https://kodik-api.com")
TOKEN_OVERRIDE = os.environ.get("KODIK_TOKEN") or None

_kodik = None  # {parser, token, error}
_load_lock = threading.Lock()

_CACHE = {}
_CACHE_LOCK = threading.Lock()
_CACHE_TTL = int(os.environ.get("BRIDGE_CACHE_TTL", str(6 * 3600)))


def _cached(key):
    with _CACHE_LOCK:
        e = _CACHE.get(key)
        if e and time.time() - e[0] < (e[2] if len(e) > 2 else _CACHE_TTL):
            return e[1]
    return None


def _store(key, val, ttl=None):
    with _CACHE_LOCK:
        if len(_CACHE) > 5000:
            _CACHE.clear()
        _CACHE[key] = (time.time(), val, ttl or _CACHE_TTL)

# --- A8.1: single-flight + лимит апстрима + негативный кэш ---------------------
# Бурст из N одновременных запросов одного ключа = ОДИН поход в апстрим:
# остальные ждут результат лидера. Одновременные live-резолвы ограничены
# BRIDGE_UPSTREAM_CONC (защита токена от rate-limit). Ошибки апстрима кэшируются
# на BRIDGE_NEG_TTL секунд (анти-шторм), успешные — на BRIDGE_CACHE_TTL.
_INFLIGHT = {}
_INFLIGHT_LOCK = threading.Lock()
_UPSTREAM_SEM = threading.Semaphore(int(os.environ.get("BRIDGE_UPSTREAM_CONC", "4")))
_NEG_TTL = int(os.environ.get("BRIDGE_NEG_TTL", "30"))


def _single_flight(key, fn):
    with _INFLIGHT_LOCK:
        fl = _INFLIGHT.get(key)
        leader = fl is None
        if leader:
            fl = _INFLIGHT[key] = [threading.Event(), None]
    if not leader:
        fl[0].wait(55)  # чуть меньше клиентского таймаута (60 с)
        if fl[1] is not None:
            return fl[1]
        hit = _cached(key)
        return hit if hit is not None else {"error": "resolve ещё идёт — повторите чуть позже"}
    try:
        with _UPSTREAM_SEM:
            result = fn()
        if result.get("sources"):
            _store(key, result)
        else:
            _store(key, result, _NEG_TTL)
        fl[1] = result
        return result
    except Exception as e:  # noqa: BLE001
        err = {"error": f"bridge: {e}"}
        _store(key, err, _NEG_TTL)
        fl[1] = err
        return err
    finally:
        fl[0].set()
        with _INFLIGHT_LOCK:
            _INFLIGHT.pop(key, None)



def _load_kodik_module():
    """Импорт anime_parsers_ru с фолбэком compat-загрузчика (f-strings из py3.12)."""
    try:
        from anime_parsers_ru import KodikParser  # noqa: F401

        return sys.modules["anime_parsers_ru.parser_kodik"], None
    except Exception:
        pass
    pkg_dir = None
    for p in sys.path:
        cand = os.path.join(p, "anime_parsers_ru")
        if os.path.isdir(cand):
            pkg_dir = cand
            break
    if not pkg_dir:
        return None, "anime-parsers-ru не установлен"
    pkg = types.ModuleType("anime_parsers_ru")
    pkg.__path__ = [pkg_dir]
    sys.modules["anime_parsers_ru"] = pkg
    for sub in ("parser_kodik", "utils", "parsers_urls", "exceptions"):
        f = os.path.join(pkg_dir, f"{sub}.py")
        if not os.path.exists(f):
            continue
        spec = importlib.util.spec_from_file_location(f"anime_parsers_ru.{sub}", f)
        m = importlib.util.module_from_spec(spec)
        sys.modules[f"anime_parsers_ru.{sub}"] = m
        try:
            spec.loader.exec_module(m)
        except SyntaxError as e:
            if sub == "parser_kodik":
                return None, f"parser_kodik несовместим с Python {sys.version_info[0]}.{sys.version_info[1]}: {e}"
    mod = sys.modules.get("anime_parsers_ru.parser_kodik")
    return (mod, None) if mod else (None, "parser_kodik не найден")


def kodik():
    global _kodik
    if _kodik:
        return _kodik
    with _load_lock:
        if _kodik:
            return _kodik
        return _kodik_init()


def _kodik_init():
    global _kodik
    mod, err = _load_kodik_module()
    if not mod:
        _kodik = {"parser": None, "token": None, "error": err}
        return _kodik
    try:
        parser = mod.KodikParser(token=TOKEN_OVERRIDE) if TOKEN_OVERRIDE else mod.KodikParser()
        token = TOKEN_OVERRIDE or getattr(parser, "TOKEN", None)
        _kodik = {"parser": parser, "token": token, "error": None if token else "токен не получен"}
    except Exception as e:  # noqa: BLE001
        _kodik = {"parser": None, "token": None, "error": f"KodikParser: {e}"}
    return _kodik


def _episode_link(result, episode):
    """seasons[*].episodes[*] → ссылка точной серии (защищённо к любым формам)."""
    def pick(eps):
        if isinstance(eps, dict):
            it = eps.get(str(episode))
            if isinstance(it, dict) and it.get("link"):
                return it["link"]
            if isinstance(it, str):
                return it
        elif isinstance(eps, list):
            for e in eps:
                if isinstance(e, dict) and str(e.get("episode")) == str(episode) and e.get("link"):
                    return e["link"]
        return None

    seasons = result.get("seasons") or {}
    if isinstance(seasons, dict):
        for sv in seasons.values():
            if isinstance(sv, dict):
                link = pick(sv.get("episodes"))
                if link:
                    return link
            elif isinstance(sv, str):
                continue
    elif isinstance(seasons, list):
        for sv in seasons:
            if isinstance(sv, dict):
                link = pick(sv.get("episodes"))
                if link:
                    return link
    return pick(result.get("episodes"))


def resolve(context):
    episode = int(context.get("episode") or 1)
    key = f"kodik:{context.get('shikimoriId') or context.get('originalTitle')}:{episode}"
    hit = _cached(key)
    if hit is not None:
        return hit
    return _single_flight(key, lambda: _resolve_live(context, episode))


def _resolve_live(context, episode):
    k = kodik()
    if not k["token"]:
        return {"error": f"kodik: {k['error'] or 'нет токена'}"}
    params = {
        "token": k["token"],
        "with_episodes": "true",
        "episode": episode,
        "limit": int(os.environ.get("KODIK_EPISODE_SEARCH_LIMIT", "10")),
    }
    if context.get("shikimoriId"):
        params["shikimori_id"] = context["shikimoriId"]
    else:
        params["title_orig"] = context.get("originalTitle") or context.get("title")
    try:
        r = requests.get(f"{API}/search", params=params, timeout=int(os.environ.get("KODIK_TIMEOUT_MS", "8000")) / 1000)
        data = r.json()
    except Exception as e:  # noqa: BLE001
        return {"error": f"kodik api: {e}"}
    sources = []
    for res in data.get("results") or []:
        link = _episode_link(res, episode) or res.get("link")
        if not link:
            continue
        tr = res.get("translation") or {}
        sources.append(
            {
                "translationId": str(tr.get("id", len(sources))),
                "label": tr.get("title") or "Kodik",
                "kind": "subtitles" if tr.get("type") == "subtitles" else "voice",
                "embedUrl": link if link.startswith("http") else f"https:{link}",
                "type": res.get("type") or "anime-serial",
            }
        )
    if not sources:
        return {"error": "kodik: episode-specific источники не найдены"}
    return {"sources": sources}


ABORTED = (ConnectionAbortedError, BrokenPipeError, ConnectionResetError)


# A8.1: ограничение одновременно ОБРАБАТЫВАЮЩИХ соединений. ThreadingHTTPServer
# плодит поток на соединение; 100 активных потоков в CPython устраивают GIL-трешинг
# (прогрев-кейс 100 warm-запросов деградировал до p50≈15 c). Семафор оставляет
# N потоков в работе, остальные спят в очереди (ядерный backlog=128 держит их без потерь).
_HANDLER_SEM = threading.Semaphore(int(os.environ.get("BRIDGE_MAX_HANDLERS", "16")))


class Handler(BaseHTTPRequestHandler):
    def handle(self):
        with _HANDLER_SEM:
            super().handle()

    def _send(self, obj, code=200):
        data = json.dumps(obj, ensure_ascii=False).encode()
        try:
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except ABORTED:
            pass  # клиент закрыл соединение по таймауту — не ошибка bridge

    def do_GET(self):
        if self.path.startswith("/health"):
            k = kodik()
            self._send({"ok": bool(k["token"]), "reason": k["error"] or "kodik ready"})
        else:
            self._send({"error": "not found"}, 404)

    def do_POST(self):
        if not self.path.startswith("/resolve"):
            return self._send({"error": "not found"}, 404)
        length = int(self.headers.get("Content-Length", 0))
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except Exception:
            return self._send({"error": "bad json"}, 400)
        try:
            self._send(resolve(body.get("context", {})))
        except ABORTED:
            pass
        except Exception as e:  # noqa: BLE001
            try:
                self._send({"error": f"bridge error: {e}"}, 500)
            except ABORTED:
                pass

    def log_message(self, *args):  # тихо
        pass


class QuietServer(ThreadingHTTPServer):
    # A8.1: штатный backlog=5 ронял бурсты из 100 соединений в SYN-retry (~17 c p50);
    # 128 + daemon-потоки держат параллельные клиенты без потерь.
    request_queue_size = 128
    daemon_threads = True

    def handle_error(self, request, client_address):
        exc = sys.exc_info()[1]
        if isinstance(exc, ABORTED):
            return  # клиент оборвал соединение по таймауту — не спамим
        super().handle_error(request, client_address)


if __name__ == "__main__":
    kodik()  # прогрев пула токенов до начала приёма запросов
    print(f"kodik_bridge v2 listening on 127.0.0.1:{PORT}")
    QuietServer(("127.0.0.1", PORT), Handler).serve_forever()
