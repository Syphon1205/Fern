import os
from typing import List, Dict, Generator, Optional
import httpx

try:
    from openai import OpenAI  # OpenAI and OpenRouter compatible
except Exception:
    OpenAI = None  # type: ignore

try:
    import anthropic
except Exception:
    anthropic = None  # type: ignore

try:
    import google.generativeai as genai
except Exception:
    genai = None  # type: ignore

try:
    import ollama as ollama_sdk
except Exception:
    ollama_sdk = None  # type: ignore


def _concat_messages(messages: List[Dict]) -> str:
    parts: List[str] = []
    for m in messages:
        role = m.get("role", "user")
        content = m.get("content", "")
        parts.append(f"{role}: {content}")
    return "\n".join(parts)


def _get_openai_client(base_url: Optional[str] = None, api_key_env: str = "OPENAI_API_KEY"):
    api_key = os.getenv(api_key_env)
    if not api_key or OpenAI is None:
        return None
    if base_url:
        return OpenAI(api_key=api_key, base_url=base_url)
    return OpenAI(api_key=api_key)


def _get_azure_openai_client():
    # Uses OpenAI client pointed at Azure endpoint
    endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")  # e.g. https://YOUR-RESOURCE.openai.azure.com
    api_key = os.getenv("AZURE_OPENAI_API_KEY")
    if not endpoint or not api_key or OpenAI is None:
        return None
    base_url = endpoint.rstrip("/") + "/openai"
    return OpenAI(api_key=api_key, base_url=base_url)


OPENAI_COMPAT: Dict[str, Dict[str, Optional[str]]] = {
    # provider: { base_url, env }
    "openai": {"base_url": None, "env": "OPENAI_API_KEY"},
    "openrouter": {"base_url": "https://openrouter.ai/api/v1", "env": "OPENROUTER_API_KEY"},
    "together": {"base_url": "https://api.together.xyz/v1", "env": "TOGETHER_API_KEY"},
    "fireworks": {"base_url": "https://api.fireworks.ai/inference/v1", "env": "FIREWORKS_API_KEY"},
    "perplexity": {"base_url": "https://api.perplexity.ai", "env": "PERPLEXITY_API_KEY"},
    "mistral": {"base_url": "https://api.mistral.ai/v1", "env": "MISTRAL_API_KEY"},
    "deepseek": {"base_url": "https://api.deepseek.com", "env": "DEEPSEEK_API_KEY"},
    # Local/OpenAI-compatible gateways
    "litellm": {"base_url": None, "env": "LITELLM_API_KEY"},  # use LITELLM_BASE_URL
    "vllm": {"base_url": None, "env": "VLLM_API_KEY"},        # use VLLM_BASE_URL
}


def chat_once(messages: List[Dict], provider: str = "openai", model: str = "gpt-4o-mini") -> str:
    """
    Return a single assistant message for the given conversation.
    Falls back to a local echo if no provider/key is configured.
    """
    try:
        # OpenAI-compatible providers (including OpenAI/OpenRouter/Together/Fireworks/Perplexity/Mistral/DeepSeek)
        if provider in OPENAI_COMPAT:
            base_url = OPENAI_COMPAT[provider]["base_url"]
            env = OPENAI_COMPAT[provider]["env"] or "OPENAI_API_KEY"
            client = _get_openai_client(base_url=base_url, api_key_env=env)
            if client is not None:
                resp = client.chat.completions.create(
                    model=model,
                    messages=messages,
                    temperature=0.2,
                )
                return resp.choices[0].message.content or ""

        if provider == "azure":
            # model should be Azure deployment name
            client = _get_azure_openai_client()
            if client is not None:
                resp = client.chat.completions.create(
                    model=model,
                    messages=messages,
                    temperature=0.2,
                )
                return resp.choices[0].message.content or ""

        if provider == "anthropic" and anthropic is not None:
            key = os.getenv("ANTHROPIC_API_KEY")
            if key:
                aclient = anthropic.Anthropic(api_key=key)
                # Anthropics expects a different message shape; simplify by concatenating
                prompt_text = _concat_messages(messages)
                msg = aclient.messages.create(
                    model=model,
                    max_tokens=1024,
                    messages=[{"role": "user", "content": prompt_text}],
                )
                # content is a list; join text segments
                chunks = []
                for block in getattr(msg, "content", []) or []:
                    if getattr(block, "type", "") == "text":
                        chunks.append(getattr(block, "text", ""))
                return "".join(chunks) or ""

        if provider == "gemini" and genai is not None:
            key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
            if key:
                genai.configure(api_key=key)
                prompt_text = _concat_messages(messages)
                mdl = genai.GenerativeModel(model)
                resp = mdl.generate_content(prompt_text)
                return getattr(resp, "text", "") or ""

        if provider == "ollama" and ollama_sdk is not None:
            # Requires local Ollama running
            client = ollama_sdk.Client()
            # Keep only user/assistant parts; Ollama supports chat format
            resp = client.chat(model=model, messages=[{"role": m.get("role", "user"), "content": m.get("content", "")} for m in messages if m.get("role") in ("user", "assistant", "system")])
            msg = resp.get("message", {})
            return msg.get("content", "")

        if provider == "cohere":
            key = os.getenv("COHERE_API_KEY")
            if key:
                # Minimal non-streaming chat call
                # Build chat_history and latest message
                chat_history = []
                last_user = ""
                for m in messages:
                    role = m.get("role")
                    content = m.get("content", "")
                    if role == "user":
                        chat_history.append({"role": "USER", "message": content})
                        last_user = content
                    elif role == "assistant":
                        chat_history.append({"role": "CHATBOT", "message": content})
                payload = {
                    "model": model,
                    "message": last_user or _concat_messages(messages),
                    "chat_history": chat_history,
                }
                try:
                    with httpx.Client(timeout=30) as h:
                        r = h.post(
                            "https://api.cohere.com/v1/chat",
                            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                            json=payload,
                        )
                        r.raise_for_status()
                        data = r.json()
                        return data.get("text") or data.get("response", {}).get("text", "") or ""
                except Exception as e:
                    return f"[Provider error: {e}]"
    except Exception as e:
        return f"[Provider error: {e}]"
    # Fallback: simple echo assistant
    last_user = next((m["content"] for m in reversed(messages) if m.get("role") == "user"), "")
    return f"You said: {last_user}"


def chat_stream(messages: List[Dict], provider: str = "openai", model: str = "gpt-4o-mini") -> Generator[str, None, None]:
    """
    Stream assistant tokens. Falls back to a single chunk if streaming isn't available.
    """
    # 1) OpenAI-compatible (OpenAI, OpenRouter, Together, Fireworks, Perplexity, Mistral, DeepSeek) + Azure
    if provider in set(OPENAI_COMPAT.keys()) | {"azure"}:
        try:
            if provider == "azure":
                client = _get_azure_openai_client()
            else:
                base_url = OPENAI_COMPAT[provider]["base_url"]
                api_key_env = OPENAI_COMPAT[provider]["env"] or "OPENAI_API_KEY"
                # Allow ENV override for base_url for local gateways (e.g., LITELLM_BASE_URL, VLLM_BASE_URL)
                if base_url is None:
                    env_base = os.getenv(f"{provider.upper()}_BASE_URL")
                    if env_base:
                        base_url = env_base
                client = _get_openai_client(base_url=base_url, api_key_env=api_key_env)
            if client is not None:
                # Prefer simple iterator API if available
                try:
                    iterator = client.chat.completions.create(
                        model=model,
                        messages=messages,
                        temperature=0.2,
                        stream=True,
                    )
                    for event in iterator:
                        try:
                            delta = event.choices[0].delta  # type: ignore[attr-defined]
                            if delta and getattr(delta, "content", None):
                                yield delta.content  # type: ignore[index]
                        except Exception:
                            # Some SDKs use a different shape
                            piece = getattr(event, "delta", None)
                            if piece and getattr(piece, "content", None):
                                yield piece.content
                    return
                except Exception:
                    # Fallback to with_streaming_response if present
                    try:
                        with client.chat.completions.with_streaming_response.create(
                            model=model,
                            messages=messages,
                            temperature=0.2,
                            stream=True,
                        ) as stream:
                            for event in stream:
                                if hasattr(event, "delta") and event.delta and getattr(event.delta, "content", None):
                                    yield event.delta.content
                            return
                    except Exception:
                        pass
        except Exception:
            pass

    # 2) Anthropic streaming
    if provider == "anthropic" and anthropic is not None:
        try:
            key = os.getenv("ANTHROPIC_API_KEY")
            if key:
                aclient = anthropic.Anthropic(api_key=key)
                prompt_text = _concat_messages(messages)
                with aclient.messages.stream(
                    model=model,
                    max_tokens=1024,
                    messages=[{"role": "user", "content": prompt_text}],
                ) as stream:
                    for event in stream:
                        try:
                            if event.type == "content_block_delta" and event.delta and getattr(event.delta, "text", None):
                                yield event.delta.text
                        except Exception:
                            pass
                    return
        except Exception:
            pass

    # 3) Gemini streaming
    if provider == "gemini" and genai is not None:
        try:
            key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
            if key:
                genai.configure(api_key=key)
                prompt_text = _concat_messages(messages)
                mdl = genai.GenerativeModel(model)
                for chunk in mdl.generate_content(prompt_text, stream=True):
                    try:
                        text = getattr(chunk, "text", None)
                        if text:
                            yield text
                    except Exception:
                        pass
                return
        except Exception:
            pass

    # 4) Ollama: many clients return streaming on client.chat_stream; keep simple fallback for now
    # If needed, implement streaming later; otherwise fallback below

    # Fallback non-streaming
    yield chat_once(messages, provider=provider, model=model)

