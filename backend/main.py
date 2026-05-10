import os
import sys
from pathlib import Path
import uvicorn


def load_app():
    try:
        from backend.app.main import app
    except ModuleNotFoundError:
        backend_dir = Path(__file__).resolve().parent
        if str(backend_dir) not in sys.path:
            sys.path.insert(0, str(backend_dir))
        from app.main import app
    return app


def main():
    host = os.getenv("BACKEND_HOST", "127.0.0.1")
    port = int(os.getenv("BACKEND_PORT", "8123"))
    uvicorn.run(
        load_app(),
        host=host,
        port=port,
        log_level="info",
        loop="asyncio",
        http="h11",
    )


if __name__ == "__main__":
    main()
