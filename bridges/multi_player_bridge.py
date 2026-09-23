#!/usr/bin/env python3
"""
multi_player_bridge.py v2 — локальный bridge CVH (AnimeGo) + AniBoom (порт 8766).

Боевая схема оригинала:
  anime-parsers-ru (AnimegoParser) → get_voices(anime_id, episode)
  → голосовые дорожки CVH (cdn-iframe / cvh_get_stream) и AniBoom (aniboom embed)
  → episode-specific источники для конкретной серии.

Контракт для Next.js:
  GET  /health  → { "ok": bool, "reason": str }
  POST /resolve → { "provider": "cvh"|"aniboom", "context": ProviderContext }
       → { "sources": [{translationId,label,kind,embedUrl,type}] } | { "error": str }

Установка:  pip install https://github.com/YaNesyTortiK/AnimeParsers/archive/refs/heads/main.zip
Запуск:     python bridges/multi_player_bridge.py   (порт: MULTIPLAYER_BRIDGE_PORT, по умолчанию 8766)
"""
import json
import os
import time
import importlib.util
import sys
import types
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("MULTIPLAYER_BRIDGE_PORT", "8766"))

_animego = None  # {parser, error}
_load_lock = threading.Lock()

# Внутренний кэш bridge: повторные запросы той же серии отдаём мгновенно,
# чтобы не упираться в таймауты клиента и не скрапить AnimeGo повторно.
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



def _load_animego():
    global _animego
    if _animego:
        return _animego
    with _load_lock:
        if _animego:
            return _animego
        return _load_animego_unlocked()


def _load_animego_unlocked():
    global _animego
    pkg_dir = None
    for p in sys.path:
        cand = os.path.join(p, "anime_parsers_ru")
        if os.path.isdir(cand):
            pkg_dir = cand
            break
    if not pkg_dir:
        _animego = {"parser": None, "error": "anime-parsers-ru не установлен"}
        return _animego
    pkg = types.ModuleType("anime_parsers_ru")
    pkg.__path__ = [pkg_dir]
    sys.modules["anime_parsers_ru"] = pkg
    loaded = []
    for sub in ("parser_kodik", "parser_animego", "utils", "parsers_urls", "exceptions"):
        f = os.path.join(pkg_dir, f"{sub}.py")
        if not os.path.exists(f):
            continue
        spec = importlib.util.spec_from_file_location(f"anime_parsers_ru.{sub}", f)
        m = importlib.util.module_from_spec(spec)
        sys.modules[f"anime_parsers_ru.{sub}"] = m
        try:
            spec.loader.exec_module(m)
            loaded.append(sub)
        except SyntaxError:
            continue
    mod = sys.modules.get("anime_parsers_ru.parser_animego")
    if not mod or not hasattr(mod, "AnimegoParser"):
        _animego = {"parser": None, "error": "parser_animego не загрузился (нужен Python 3.11+ и anime-parsers-ru)"}
        return _animego
    try:
        _animego = {"parser": mod.AnimegoParser(), "error": None}
    except Exception as e:  # noqa: BLE001
        _animego = {"parser": None, "error": f"AnimegoParser: {e}"}
    return _animego


def _norm_embed(u):
    if not u:
        return None
    return u if str(u).startswith("http") else f"https:{u}"


def resolve(provider, context):
    episode = int(context.get("episode") or 1)
    key = f"{provider}:{context.get('shikimoriId') or context.get('originalTitle')}:{episode}"
    hit = _cached(key)
    if hit is not None:
        return hit
    return _single_flight(key, lambda: _resolve_live(provider, context, episode))


def _resolve_live(provider, context, episode):
    a = _load_animego()
    if not a["parser"]:
        return {"error": f"animego: {a['error']}"}
    parser = a["parser"]
    episode = int(context.get("episode") or 1)
    anime_id = str(context.get("shikimoriId") or "")
    if not anime_id:
        return {"error": "animego: нужен shikimoriId в контексте"}
    def fetch_voices(aid):
        try:
            raw = parser.get_voices(str(aid), episode) or {}
        except Exception:
            return []
        if isinstance(raw, dict):
            raw = raw.get("voices") or []
        return [v for v in raw if isinstance(v, dict)]

    voices = fetch_voices(anime_id)
    if not voices:
        # fолбэк: id animego ≠ id shikimori — ищем тайтл по названию
        query = context.get("originalTitle") or context.get("title") or ""
        try:
            found = parser.search(query) or []
        except Exception as e:  # noqa: BLE001
            return {"error": f"animego search: {e}"}
        norm = lambda x: x.lower().replace(" ", "")
        best = None
        for cand in found:
            if norm(cand.get("original_title") or "") == norm(query):
                best = cand
                break
        best = best or (found[0] if found else None)
        if best and best.get("id"):
            voices = fetch_voices(best["id"])
    if not voices:
        return {"error": f"{provider}: голоса/источники для серии {episode} не найдены"}

    sources = []
    for key, voice in enumerate(voices):
        player = str(voice.get("player") or voice.get("source") or "").lower()
        if provider == "cvh" and player not in ("cvh", "animego", ""):
            continue
        if provider == "aniboom" and player not in ("aniboom", ""):
            continue
        embed = _norm_embed(voice.get("embed") or voice.get("embedUrl") or voice.get("url"))
        if not embed:
            # пробуем собрать stream-URL методами парсера
            try:
                if provider == "cvh" and voice.get("cvh_id"):
                    stream = parser.cvh_get_stream(voice["cvh_id"], 1, episode, str(key))
                    embed = _norm_embed((stream or {}).get("stream") or (stream or {}).get("url"))
                elif provider == "aniboom" and voice.get("translation_id"):
                    stream = parser.aniboom_get_stream_for_voice(str(voice["translation_id"]), episode, anime_id)
                    embed = _norm_embed((stream or {}).get("stream") or (stream or {}).get("url"))
            except Exception:
                embed = None
        if not embed:
            continue
        sources.append(
            {
                "translationId": str(voice.get("translation_id") or voice.get("cvh_id") or key),
                "label": voice.get("label") or voice.get("title") or str(key),
                "kind": "subtitles" if voice.get("kind") in ("subs", "subtitles") else "voice",
                "embedUrl": embed,
                "type": "anime-serial",
            }
        )
    if not sources:
        return {"error": f"{provider}: голоса/источники для серии {episode} не найдены"}
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
            pass  # клиент закрыл соединение по таймауту — это не ошибка bridge

    def do_GET(self):
        if self.path.startswith("/health"):
            a = _load_animego()
            self._send({"ok": bool(a["parser"]), "reason": a["error"] or "animego ready"})
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
            self._send(resolve(body.get("provider", "cvh"), body.get("context", {})))
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
            return  # клиент оборвал соединение по таймауту — не спамим трейсбеками
        super().handle_error(request, client_address)


if __name__ == "__main__":
    _load_animego()  # прогрев парсера до начала приёма запросов
    print(f"multi_player_bridge v2 listening on 127.0.0.1:{PORT}")
    QuietServer(("127.0.0.1", PORT), Handler).serve_forever()
