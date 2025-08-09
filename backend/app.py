import os
import threading
from pathlib import Path
from typing import List, Dict, Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .llm import chat_once, chat_stream
from dotenv import load_dotenv
import platform
import getpass
import hashlib
import uuid
import httpx
try:
    import ollama as ollama_sdk
except Exception:
    ollama_sdk = None  # type: ignore

ROOT = Path(__file__).resolve().parents[1]
# Prefer the built React app under web/dist, fall back to legacy frontend/
WEB_DIST_DIR = ROOT / "web" / "dist"
LEGACY_FRONTEND_DIR = ROOT / "frontend"
FRONTEND_DIR = WEB_DIST_DIR if WEB_DIST_DIR.exists() else LEGACY_FRONTEND_DIR
ASSETS_DIR = ROOT / "Assets"
DATA_DIR = ROOT / "data" / "conversations"
DATA_DIR.mkdir(parents=True, exist_ok=True)
SETTINGS_PATH = ROOT / "settings.json"

app = FastAPI(title="ChatUI")

# CORS for local dev/desktop
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load environment variables from .env if present
load_dotenv()

# Serve static frontend
if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")
if ASSETS_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(ASSETS_DIR)), name="assets")


# --- Conversation persistence helpers ---
def _conv_path(cid: str) -> Path:
    return DATA_DIR / f"{cid}.json"


def _now_iso() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


def _load_conv(cid: str) -> Dict[str, Any]:
    p = _conv_path(cid)
    if p.exists():
        try:
            import json
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            return {"id": cid, "title": "Conversation", "messages": []}
    return {"id": cid, "title": "Conversation", "messages": []}


def _save_conv(cid: str, conv: Dict[str, Any]) -> None:
    import json
    conv["updated_at"] = _now_iso()
    _conv_path(cid).write_text(json.dumps(conv, indent=2), encoding="utf-8")


def read_settings() -> Dict[str, Any]:
    import json
    if SETTINGS_PATH.exists():
        try:
            return json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def write_settings(data: Dict[str, Any]) -> None:
    import json
    SETTINGS_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")


# --- Security: machine binding for stored API keys ---
SECRET_KEYS = [
    "OPENAI_API_KEY",
    "OPENROUTER_API_KEY",
    "ANTHROPIC_API_KEY",
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "AZURE_OPENAI_API_KEY",
    "TOGETHER_API_KEY",
    "FIREWORKS_API_KEY",
    "PERPLEXITY_API_KEY",
    "MISTRAL_API_KEY",
    "DEEPSEEK_API_KEY",
    "COHERE_API_KEY",
    "LITELLM_API_KEY",
    "VLLM_API_KEY",
]

def _current_machine_id() -> str:
    """Create a stable, non-PII-ish machine fingerprint and hash it."""
    try:
        uname = platform.uname()
        user = getpass.getuser()
        mac = uuid.getnode()  # may return a random value on some systems
        raw = f"{uname.system}|{uname.node}|{uname.machine}|{user}|{mac}"
    except Exception:
        raw = platform.node() or "unknown"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()

def _machine_guard_wipe_if_mismatch() -> None:
    """If stored machine_id differs from current, wipe stored API keys and env vars."""
    try:
        current_id = _current_machine_id()
        data = read_settings()
        stored_id = str(data.get("machine_id")) if data else None
        if stored_id and stored_id != current_id:
            # Wipe only secret keys
            changed = False
            for k in SECRET_KEYS:
                if data.get(k):
                    data.pop(k, None)
                    changed = True
                # Also clear from environment to avoid accidental use
                if os.environ.get(k):
                    try:
                        del os.environ[k]
                    except Exception:
                        pass
            if changed:
                print("[security] Machine changed; wiped stored API keys from settings.")
            data["machine_id"] = current_id
            write_settings(data)
        elif not stored_id:
            # First run: stamp machine_id
            data = data or {}
            data["machine_id"] = current_id
            write_settings(data)
    except Exception as e:
        print(f"[security] Machine guard error: {e}")

# Run guard at import/startup
_machine_guard_wipe_if_mismatch()


@app.get("/")
async def index():
    index_path = FRONTEND_DIR / "index.html"
    if index_path.exists():
        return HTMLResponse(index_path.read_text(encoding="utf-8"))
    return HTMLResponse("<h1>ChatUI</h1><p>Frontend not found.</p>")


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/settings")
async def get_settings(request: Request):
    data = read_settings()
    # Frontend client guard (web browsers): if a different client_id connects, wipe secrets
    try:
        cid = (request.headers.get('x-client-id') or '').strip()
        if cid:
            last = str(data.get('last_client_id') or '')
            if last and last != cid:
                changed = False
                for k in SECRET_KEYS:
                    if data.get(k):
                        data.pop(k, None)
                        changed = True
                    if os.environ.get(k):
                        try: del os.environ[k]
                        except Exception: pass
                if changed:
                    print("[security] New client detected; wiped stored API keys.")
                data['last_client_id'] = cid
                write_settings(data)
            elif not last:
                data['last_client_id'] = cid
                write_settings(data)
    except Exception as e:
        print(f"[security] client guard (get_settings) error: {e}")
    # Do not echo secrets back unless explicitly requested; here we only indicate presence
    masked = {**data}
    for key in SECRET_KEYS:
        if key in masked and masked[key]:
            masked[key] = True  # indicate set
    return masked


@app.post("/api/settings")
async def save_settings(body: Dict[str, Any], request: Request):
    # Merge settings; do not wipe keys unless explicitly cleared with empty string
    existing = read_settings()
    incoming = body or {}
    merged: Dict[str, Any] = {**existing}
    for k, v in incoming.items():
        if isinstance(v, str) and v == "":
            if k in merged:
                merged.pop(k)
        else:
            merged[k] = v
    # Client guard: stamp/compare client id and wipe on change
    try:
        cid = (request.headers.get('x-client-id') or '').strip()
        if cid:
            last = str(merged.get('last_client_id') or '')
            if last and last != cid:
                for k in SECRET_KEYS:
                    merged.pop(k, None)
                print("[security] New client detected on save; wiped API keys from payload.")
            merged['last_client_id'] = cid
    except Exception as e:
        print(f"[security] client guard (save_settings) error: {e}")
    # Always stamp current machine id when saving settings
    try:
        merged["machine_id"] = _current_machine_id()
    except Exception:
        pass
    write_settings(merged)
    return {"ok": True}


# --- Conversation CRUD API ---
@app.get("/api/conversations")
async def list_conversations():
    items = []
    for f in sorted(DATA_DIR.glob("*.json")):
        try:
            import json
            data = json.loads(f.read_text(encoding="utf-8"))
            items.append({
                "id": data.get("id") or f.stem,
                "title": data.get("title") or "Conversation",
                "pinned": bool(data.get("pinned")),
                "updated_at": data.get("updated_at"),
            })
        except Exception:
            pass
    # Sort by updated_at desc (ISO strings sort lexicographically), then bring pinned to top (stable sort)
    items.sort(key=lambda x: x.get("updated_at") or "", reverse=True)
    items.sort(key=lambda x: not bool(x.get("pinned")))
    return {"conversations": items}


@app.post("/api/conversations")
async def create_conversation(body: Dict[str, Any]):
    import uuid
    cid = body.get("id") or str(uuid.uuid4())
    title = body.get("title") or "New Chat"
    conv = {
        "id": cid,
        "title": title,
        "messages": [],
        "system_prompt": body.get("system_prompt") or "",
        "temperature": body.get("temperature"),
        "top_p": body.get("top_p"),
    }
    _save_conv(cid, conv)
    return conv


@app.get("/api/conversations/{cid}")
async def get_conversation(cid: str):
    return _load_conv(cid)


@app.patch("/api/conversations/{cid}")
async def rename_conversation(cid: str, body: Dict[str, Any]):
    conv = _load_conv(cid)
    title = body.get("title")
    if title:
        conv["title"] = title
    if "system_prompt" in body:
        conv["system_prompt"] = body.get("system_prompt") or ""
    if "temperature" in body:
        conv["temperature"] = body.get("temperature")
    if "top_p" in body:
        conv["top_p"] = body.get("top_p")
    if "pinned" in body:
        conv["pinned"] = bool(body.get("pinned"))
    if "messages" in body:
        # Replace conversation messages entirely if provided; basic validation
        msgs = body.get("messages")
        if isinstance(msgs, list):
            clean: List[Dict[str, Any]] = []
            for m in msgs:
                try:
                    r = m.get("role")
                    c = m.get("content")
                    if r in ("system", "user", "assistant") and isinstance(c, str):
                        item = {"role": r, "content": c}
                        if "reasoning" in m and isinstance(m.get("reasoning"), str):
                            item["reasoning"] = m.get("reasoning")
                        clean.append(item)
                except Exception:
                    pass
            conv["messages"] = clean
    _save_conv(cid, conv)
    return conv


@app.delete("/api/conversations/{cid}")
async def delete_conversation(cid: str):
    p = _conv_path(cid)
    if p.exists():
        p.unlink()
    return {"ok": True}


@app.post("/api/chat")
async def chat(body: Dict[str, Any]):
    messages: List[Dict] = body.get("messages", [])
    defaults = read_settings()
    provider: str = body.get("provider") or defaults.get("provider", "openai")
    model: str = body.get("model") or defaults.get("model", "gpt-4o-mini")
    conversation_id: str | None = body.get("conversation_id")
    reasoning: bool = bool(body.get("reasoning"))

    # Export API keys to process for provider SDKs during this request
    for env_key in [
        "OPENAI_API_KEY",
        "OPENROUTER_API_KEY",
        "ANTHROPIC_API_KEY",
        "GEMINI_API_KEY",
        "GOOGLE_API_KEY",
        "AZURE_OPENAI_ENDPOINT",
        "AZURE_OPENAI_API_KEY",
        "TOGETHER_API_KEY",
        "FIREWORKS_API_KEY",
        "PERPLEXITY_API_KEY",
        "MISTRAL_API_KEY",
        "DEEPSEEK_API_KEY",
        "COHERE_API_KEY",
    ]:
        val = body.get(env_key) if env_key in body else defaults.get(env_key)
        if val:
            os.environ[env_key] = str(val)

    # Add a brief reasoning instruction (concise rationale only)
    final_msgs = list(messages)
    # If conversation has a system_prompt, prepend it
    if conversation_id:
        conv0 = _load_conv(conversation_id)
        sp = (conv0.get("system_prompt") or "").strip()
        if sp:
            final_msgs = [{"role": "system", "content": sp}] + final_msgs
    if reasoning:
        final_msgs = [{
            "role": "system",
            "content": (
                "Include a short 'Reasoning:' section (1-3 sentences) before the final answer. "
                "Do not reveal chain-of-thought; keep it concise and high-level."
            ),
        }] + final_msgs

    answer = chat_once(final_msgs, provider=provider, model=model)

    # Parse out optional 'Reasoning:' header if present
    reasoning_text = None
    final_answer = answer
    if isinstance(answer, str) and "Reasoning:" in answer:
        parts = answer.split("Reasoning:", 1)
        tail = parts[1]
        if "Answer:" in tail:
            r, a = tail.split("Answer:", 1)
            reasoning_text = r.strip()
            final_answer = a.strip()
        else:
            chunks = tail.strip().split("\n\n", 1)
            reasoning_text = chunks[0].strip()
            final_answer = (chunks[1].strip() if len(chunks) > 1 else answer)

    # Save to conversation if specified
    if conversation_id:
        conv = _load_conv(conversation_id)
        # Set a better title from the first user prompt if new
        if not conv.get("messages") and messages:
            try:
                last_user = ""
                for m in reversed(messages):
                    if m.get("role") == "user" and isinstance(m.get("content"), str):
                        last_user = m["content"]
                        break
                if last_user:
                    conv["title"] = last_user[:40] + ("…" if len(last_user) > 40 else "")
            except Exception:
                pass
        conv_msgs = conv.get("messages", [])
        conv_msgs.extend(messages)
        conv_msgs.append({
            "role": "assistant",
            "content": final_answer,
            "reasoning": reasoning_text,
        })
        conv["messages"] = conv_msgs
        _save_conv(conversation_id, conv)

    return {"answer": final_answer, "reasoning": reasoning_text, "model": model}


@app.get("/api/models/{provider}")
async def list_models(provider: str):
    provider = (provider or "").lower()
    defaults = read_settings()
    # Make env available for outbound requests if needed
    for env_key in [
        "OPENROUTER_API_KEY",
        "OPENAI_API_KEY",
        "ANTHROPIC_API_KEY",
        "GEMINI_API_KEY",
        "GOOGLE_API_KEY",
        "AZURE_OPENAI_ENDPOINT",
        "AZURE_OPENAI_API_KEY",
        "TOGETHER_API_KEY",
        "FIREWORKS_API_KEY",
        "PERPLEXITY_API_KEY",
        "MISTRAL_API_KEY",
        "DEEPSEEK_API_KEY",
        "COHERE_API_KEY",
        "LITELLM_API_KEY",
        "VLLM_API_KEY",
    ]:
        val = defaults.get(env_key) or os.getenv(env_key)
        if val:
            os.environ[env_key] = str(val)

    items = []
    try:
        if provider == "openrouter":
            key = os.getenv("OPENROUTER_API_KEY")
            if not key:
                return {"models": [], "note": "Set OPENROUTER_API_KEY in Settings"}
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.get(
                    "https://openrouter.ai/api/v1/models",
                    headers={"Authorization": f"Bearer {key}"},
                )
                r.raise_for_status()
                data = r.json()
                for m in data.get("data", []):
                    # OpenRouter returns id, name, context_length, pricing, etc.
                    mid = m.get("id")
                    name = m.get("name") or mid
                    if mid:
                        items.append({"id": mid, "name": name})
                return {"models": items}

        if provider in ("litellm", "vllm"):
            # Try to query the OpenAI-compatible /v1/models endpoint
            base_env = f"{provider.upper()}_BASE_URL"
            key_env = f"{provider.upper()}_API_KEY"
            base_url = (os.getenv(base_env) or "").rstrip("/")
            api_key = os.getenv(key_env) or ""
            if not base_url:
                return {"models": [], "note": f"Set {base_env} in Settings"}
            try:
                async with httpx.AsyncClient(timeout=10) as client:
                    r = await client.get(
                        f"{base_url}/v1/models",
                        headers={"Authorization": f"Bearer {api_key}"} if api_key else None,
                    )
                    r.raise_for_status()
                    data = r.json()
                    items = []
                    for m in (data.get("data") or data.get("models") or []):
                        mid = m.get("id") or m.get("name")
                        if mid:
                            items.append({"id": mid, "name": mid})
                    return {"models": items}
            except Exception:
                # Fallback to empty; user can type model id manually
                return {"models": []}

        if provider == "ollama":
            if ollama_sdk is None:
                return {"models": [], "note": "ollama package missing"}
            try:
                client = ollama_sdk.Client()
                tags = client.list().get("models", [])
                for t in tags:
                    mid = t.get("name")
                    if mid:
                        items.append({"id": mid, "name": mid})
            except Exception:
                pass
            return {"models": items}

        if provider == "openai":
            # Curated common chat models (update as OpenAI releases)
            items = [
                {"id": "gpt-5", "name": "GPT-5"},
                {"id": "gpt-4o", "name": "GPT-4o"},
                {"id": "gpt-4o-mini", "name": "GPT-4o Mini"},
            ]
            return {"models": items}

        if provider == "anthropic":
            items = [
                {"id": "claude-3.5-sonnet", "name": "Claude 3.5 Sonnet"},
                {"id": "claude-3-opus-20240229", "name": "Claude 3 Opus"},
                {"id": "claude-3-sonnet-20240229", "name": "Claude 3 Sonnet"},
                {"id": "claude-3-haiku-20240307", "name": "Claude 3 Haiku"},
            ]
            return {"models": items}

        if provider == "gemini":
            items = [
                {"id": "gemini-2.5-pro", "name": "Gemini 2.5 Pro"},
                {"id": "gemini-2.5-flash", "name": "Gemini 2.5 Flash"},
                {"id": "gemini-1.5-pro", "name": "Gemini 1.5 Pro"},
                {"id": "gemini-1.5-flash", "name": "Gemini 1.5 Flash"},
            ]
            return {"models": items}

        if provider == "azure":
            # Azure uses deployment names; cannot enumerate generically
            return {"models": [], "note": "Enter your Azure deployment name"}

        if provider == "together":
            items = [
                {"id": "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo", "name": "Llama 3.1 70B Instruct Turbo"},
                {"id": "mistralai/Mixtral-8x7B-Instruct-v0.1", "name": "Mixtral 8x7B Instruct"},
            ]
            return {"models": items}

        if provider == "fireworks":
            items = [
                {"id": "accounts/fireworks/models/llama-v3p1-70b-instruct", "name": "Llama 3.1 70B Instruct"},
                {"id": "accounts/fireworks/models/mixtral-8x7b-instruct", "name": "Mixtral 8x7B Instruct"},
            ]
            return {"models": items}

        if provider == "perplexity":
            items = [
                {"id": "llama-3.1-sonar-small-128k-online", "name": "Sonar Small 128k (online)"},
                {"id": "llama-3.1-sonar-large-128k-online", "name": "Sonar Large 128k (online)"},
            ]
            return {"models": items}

        if provider == "mistral":
            items = [
                {"id": "mistral-small-latest", "name": "Mistral Small"},
                {"id": "mistral-medium-latest", "name": "Mistral Medium"},
                {"id": "mistral-large-latest", "name": "Mistral Large"},
                {"id": "codestral-latest", "name": "Codestral"},
            ]
            return {"models": items}

        if provider == "deepseek":
            items = [
                {"id": "deepseek-chat", "name": "DeepSeek Chat"},
                {"id": "deepseek-reasoner", "name": "DeepSeek Reasoner"},
            ]
            return {"models": items}

        if provider == "cohere":
            items = [
                {"id": "command-r-plus", "name": "Command R+"},
                {"id": "command-r", "name": "Command R"},
            ]
            return {"models": items}
    except httpx.HTTPStatusError as e:
        return {"models": [], "error": f"HTTP {e.response.status_code}"}
    except Exception as e:
        return {"models": [], "error": str(e)}


@app.websocket("/ws/chat")
async def chat_ws(ws: WebSocket):
    await ws.accept()
    try:
        data = await ws.receive_json()
        # Ensure provider API keys are available to SDKs
        defaults = read_settings()
        for env_key in [
            "OPENAI_API_KEY",
            "OPENROUTER_API_KEY",
            "ANTHROPIC_API_KEY",
            "GEMINI_API_KEY",
            "GOOGLE_API_KEY",
            "AZURE_OPENAI_ENDPOINT",
            "AZURE_OPENAI_API_KEY",
            "TOGETHER_API_KEY",
            "FIREWORKS_API_KEY",
            "PERPLEXITY_API_KEY",
            "MISTRAL_API_KEY",
            "DEEPSEEK_API_KEY",
            "COHERE_API_KEY",
            "LITELLM_API_KEY",
            "VLLM_API_KEY",
            "LITELLM_BASE_URL",
            "VLLM_BASE_URL",
        ]:
            val = data.get(env_key) if env_key in data else defaults.get(env_key)
            if val:
                os.environ[env_key] = str(val)
        messages: List[Dict] = data.get("messages", [])
        provider: str = data.get("provider", "openai")
        model: str = data.get("model", "gpt-4o-mini")
        conversation_id: str | None = data.get("conversation_id")
        reasoning: bool = bool(data.get("reasoning"))

        # Apply system prompt and brief reasoning instruction if requested
        final_msgs = list(messages)
        if conversation_id:
            conv0 = _load_conv(conversation_id)
            sp = (conv0.get("system_prompt") or "").strip()
            if sp:
                final_msgs = [{"role": "system", "content": sp}] + final_msgs
        if reasoning:
            final_msgs = [{
                "role": "system",
                "content": (
                    "Include a short 'Reasoning:' section (1-3 sentences) before the final answer. "
                    "Do not reveal chain-of-thought; keep it concise and high-level."
                ),
            }] + final_msgs

        # Stream chunks and accumulate final text
        full_text = ""
        for chunk in chat_stream(final_msgs, provider=provider, model=model):
            full_text += chunk
            await ws.send_text(chunk)
        await ws.send_text("[END]")

        # Parse reasoning from full_text
        reasoning_text = None
        final_answer = full_text
        if isinstance(full_text, str) and "Reasoning:" in full_text:
            parts = full_text.split("Reasoning:", 1)
            tail = parts[1]
            if "Answer:" in tail:
                r, a = tail.split("Answer:", 1)
                reasoning_text = r.strip()
                final_answer = a.strip()
            else:
                chunks = tail.strip().split("\n\n", 1)
                reasoning_text = chunks[0].strip()
                final_answer = (chunks[1].strip() if len(chunks) > 1 else full_text)

        # Save to conversation if provided
        if conversation_id:
            conv = _load_conv(conversation_id)
            if not conv.get("messages") and messages:
                try:
                    last_user = ""
                    for m in reversed(messages):
                        if m.get("role") == "user" and isinstance(m.get("content"), str):
                            last_user = m["content"]
                            break
                    if last_user:
                        conv["title"] = last_user[:40] + ("…" if len(last_user) > 40 else "")
                except Exception:
                    pass
            conv_msgs = conv.get("messages", [])
            conv_msgs.extend(messages)
            conv_msgs.append({
                "role": "assistant",
                "content": final_answer,
                "reasoning": reasoning_text,
            })
            conv["messages"] = conv_msgs
            _save_conv(conversation_id, conv)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        await ws.send_text(f"[Error: {e}]")
    finally:
        try:
            await ws.close()
        except Exception:
            pass
