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
import hmac
import json
import os
import time
import re
import unicodedata
import importlib.util
import sys
import types
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("MULTIPLAYER_BRIDGE_PORT", "8766"))
# Аудит 30.09 (P1-9): в docker-compose bridge недостижим из web-контейнера,
# потому что жёстко слушал 127.0.0.1. HOST задаётся env (в контейнере —
# BRIDGE_HOST=0.0.0.0, см. Dockerfile.bridge); при выходе за loopback
# ОБЯЗАТЕЛЬНО задавайте BRIDGE_TOKEN — проверка ниже.
HOST = os.environ.get("BRIDGE_HOST", "127.0.0.1")
BRIDGE_TOKEN = os.environ.get("BRIDGE_TOKEN") or None

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
    now = time.time()
    with _CACHE_LOCK:
        # Prune expired entries first, then evict the oldest entries. Clearing
        # the entire cache under load caused repeated cold lookups every 5000 keys.
        if len(_CACHE) >= 5000 and key not in _CACHE:
            expired = [
                cache_key
                for cache_key, value in _CACHE.items()
                if now - value[0] >= (value[2] if len(value) > 2 else _CACHE_TTL)
            ]
            for cache_key in expired:
                _CACHE.pop(cache_key, None)
            if len(_CACHE) >= 5000:
                remove_count = len(_CACHE) - 3999
                oldest = sorted(_CACHE.items(), key=lambda item: item[1][0])[:remove_count]
                for cache_key, _ in oldest:
                    _CACHE.pop(cache_key, None)
        _CACHE[key] = (now, val, ttl or _CACHE_TTL)

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


def _normalize_title(value):
    """Сравнение названий без пробелов/пунктуации, с Unicode-normalization."""
    text = unicodedata.normalize("NFKC", str(value or "")).casefold()
    return "".join(char for char in text if char.isalnum())


def _candidate_year(candidate):
    for name in ("year", "year_release", "aired_year", "release_year"):
        value = candidate.get(name)
        if value:
            match = re.search(r"\\b(19|20)\\d{2}\\b", str(value))
            if match:
                return int(match.group(0))
    return None


def _find_animego_id(parser, context):
    """Получает именно ID AnimeGO по точному названию, не путая его с Shikimori ID."""
    targets = {
        value for value in (
            _normalize_title(context.get("originalTitle")),
            _normalize_title(context.get("title")),
        ) if value
    }
    if not targets:
        return None

    slug = str(context.get("slug") or "")
    year = context.get("year")
    cache_key = f"animego-id:{slug}:{year}:{'|'.join(sorted(targets))}"
    hit = _cached(cache_key)
    if hit is not None:
        rows = hit.get("sources") or []
        return str(rows[0].get("id")) if rows and rows[0].get("id") else None

    def lookup():
        matches = {}
        queries = list(dict.fromkeys(
            value for value in (context.get("originalTitle"), context.get("title"))
            if isinstance(value, str) and value.strip()
        ))
        for query in queries:
            try:
                results = parser.search(query) or []
            except Exception:
                continue
            for candidate in results:
                if not isinstance(candidate, dict):
                    continue
                candidate_names = {
                    _normalize_title(candidate.get(name))
                    for name in ("original_title", "originalTitle", "title", "name")
                }
                if not targets.intersection(candidate_names):
                    continue
                candidate_id = candidate.get("id")
                if candidate_id in (None, ""):
                    continue
                matches[str(candidate_id)] = {
                    "id": str(candidate_id),
                    "year": _candidate_year(candidate),
                }

        if not matches:
            return {"sources": [], "error": "AnimeGO: exact title not found"}

        try:
            target_year = int(year) if year else None
        except (TypeError, ValueError):
            target_year = None
        if target_year:
            exact_year = {
                key: value for key, value in matches.items()
                if value["year"] == target_year
            }
            unknown_year = {
                key: value for key, value in matches.items()
                if value["year"] is None
            }
            if exact_year:
                matches = exact_year
            elif unknown_year:
                matches = unknown_year
            elif any(value["year"] is not None for value in matches.values()):
                return {"sources": [], "error": "AnimeGO: title year mismatch"}

        if len(matches) != 1:
            return {"sources": [], "error": "AnimeGO: ambiguous exact title match"}
        only = next(iter(matches.values()))
        return {"sources": [{"id": only["id"]}]}

    result = _single_flight(cache_key, lookup)
    rows = result.get("sources") or []
    return str(rows[0].get("id")) if rows and rows[0].get("id") else None


def _get_episode_voices(parser, anime_id, episode):
    """Один запрос get_voices на серию для параллельных CVH и AniBoom."""
    cache_key = f"animego-voices:{anime_id}:{episode}"
    hit = _cached(cache_key)
    if hit is not None:
        return hit.get("sources") or []

    def lookup():
        try:
            raw = parser.get_voices(str(anime_id), int(episode)) or {}
        except Exception as exc:
            return {"sources": [], "error": f"AnimeGO voices: {exc}"}
        if isinstance(raw, dict):
            raw = raw.get("voices") or []
        voices = [voice for voice in raw if isinstance(voice, dict)] if isinstance(raw, list) else []
        return {"sources": voices, "error": None if voices else "AnimeGO: no voices for episode"}

    result = _single_flight(cache_key, lookup)
    return result.get("sources") or []


def _voice_provider(voice, embed):
    """Определяет плеер по embed URL, затем по явному полю API."""
    if embed:
        try:
            from urllib.parse import urlparse
            parsed = urlparse(embed)
            host = (parsed.hostname or "").lower()
            path = (parsed.path or "").lower()
            if "/cdn-iframe/" in path:
                return "cvh"
            if "aniboom.one" in host and "/embed/" in path:
                return "aniboom"
            if "kodik" in host or any(segment in path for segment in ("/seria/", "/serial/", "/video/")):
                return "kodik"
        except Exception:
            pass

    player = str(voice.get("player") or voice.get("source") or "").strip().lower()
    if player in ("cvh", "cdnvideohub"):
        return "cvh"
    if player == "animego":
        return "cvh" if voice.get("cvh_id") else None
    if player in ("aniboom", "ani-boom"):
        return "aniboom"
    if player in ("kodik", "kodikplayer"):
        return "kodik"
    return None


def _resolve_live(provider, context, episode):
    a = _load_animego()
    if not a["parser"]:
        return {"error": f"animego: {a['error']}"}
    parser = a["parser"]

    # Важно: shikimoriId и AnimeGO ID — разные пространства идентификаторов.
    # Сначала находим точное совпадение тайтла и используем его собственный AnimeGO ID.
    anime_id = _find_animego_id(parser, context)
    if not anime_id:
        return {"error": "AnimeGO: exact title match not found (safe skip)"}

    voices = _get_episode_voices(parser, anime_id, episode)
    if not voices:
        return {"error": f"{provider}: голоса/источники для серии {episode} не найдены"}

    sources = []
    for key, voice in enumerate(voices):
        embed = _norm_embed(voice.get("embed") or voice.get("embedUrl") or voice.get("url"))

        if not embed:
            # Старые ответы AnimeGO иногда содержат только ID. Сохраняем их
            # прежний fallback; обычные embed-ссылки проходят ниже без лишних запросов.
            try:
                if provider == "cvh" and voice.get("cvh_id"):
                    stream = parser.cvh_get_stream(voice["cvh_id"], 1, episode, str(voice.get("label") or voice.get("title") or key))
                    embed = _norm_embed((stream or {}).get("stream") or (stream or {}).get("url"))
                elif provider == "aniboom" and voice.get("translation_id"):
                    stream = parser.aniboom_get_stream_for_voice(str(voice["translation_id"]), episode, anime_id)
                    embed = _norm_embed((stream or {}).get("stream") or (stream or {}).get("url"))
            except Exception:
                embed = None

        if not embed or _voice_provider(voice, embed) != provider:
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

    def _authed(self):
        """Аудит 30.09 (P1-9): если задан BRIDGE_TOKEN — bridge проверяет его САМ
        (раньше аутентификация предполагалась только в Caddy, а в docker-сети
        контейнер открыт без защиты). Сравнение константное."""
        if not BRIDGE_TOKEN:
            return True
        got = self.headers.get("Authorization", "")
        want = f"Bearer {BRIDGE_TOKEN}"
        return hmac.compare_digest(got.encode(), want.encode())

    def _deny(self):
        self._send({"error": "unauthorized"}, 401)

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
        if not self._authed():
            return self._deny()
        if self.path.startswith("/health"):
            a = _load_animego()
            self._send({"ok": bool(a["parser"]), "reason": a["error"] or "animego ready"})
        else:
            self._send({"error": "not found"}, 404)

    def do_POST(self):
        if not self._authed():
            return self._deny()
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
    print(f"multi_player_bridge v2 listening on {HOST}:{PORT}")
    QuietServer((HOST, PORT), Handler).serve_forever()
