import os
import uvicorn

# Ensure a predictable host/port to match Electron expectations
HOST = os.environ.get("FERN_HOST", "127.0.0.1")
PORT = int(os.environ.get("FERN_PORT", "8000"))

# Import the FastAPI app
try:
    from backend.app import app  # type: ignore
except Exception as e:
    # Fallback: try relative import when frozen
    try:
        from app import app  # type: ignore
    except Exception:
        raise

if __name__ == "__main__":
    # Run uvicorn programmatically to avoid needing a CLI
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")
