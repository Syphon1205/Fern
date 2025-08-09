import os
import threading
import time
import contextlib
from urllib.request import urlopen
from urllib.error import URLError
import webview
import sys


def run_server():
    # Start uvicorn programmatically
    import uvicorn
    uvicorn.run("backend.app:app", host="127.0.0.1", port=8000, reload=False, log_level="info")


def wait_for_server(url: str, timeout: float = 15.0):
    start = time.time()
    while time.time() - start < timeout:
        try:
            with contextlib.closing(urlopen(url, timeout=2.0)) as r:
                if getattr(r, 'status', 200) in (200, 204):
                    return True
        except URLError:
            pass
        except Exception:
            pass
        time.sleep(0.25)
    return False


def main():
    # Ensure working directory at project root
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    t = threading.Thread(target=run_server, daemon=True)
    t.start()

    # Wait for server health
    wait_for_server("http://127.0.0.1:8000/api/health", timeout=20.0)

    # Launch desktop window pointing to local server
    window = webview.create_window(
        "ChatUI",
        "http://127.0.0.1:8000",
        width=1100,
        height=800,
        min_size=(900, 600),
        confirm_close=False,
        frameless=False,
        easy_drag=False,
        text_select=True,
        background_color="#0b0f18",
    )
    # Explicitly use Edge (WebView2) on Windows to avoid blank window issues
    start_kwargs = {}
    if sys.platform == "win32":
        start_kwargs["gui"] = "edgechromium"
    # Enable debug to surface any console errors from the webview
    webview.start(debug=True, **start_kwargs)


if __name__ == "__main__":
    main()
