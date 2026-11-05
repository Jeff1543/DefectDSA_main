"""
Menjalankan aplikasi lalu membuka browser:

    python run.py

Alamat: http://127.0.0.1:8000/   (ganti port dengan environment PORT)
"""

import os
import threading
import webbrowser

import uvicorn


def main() -> None:
    port = int(os.environ.get("PORT", "8000"))
    url = f"http://127.0.0.1:{port}/"

    threading.Timer(1.5, lambda: webbrowser.open(url)).start()
    print(f"Aplikasi berjalan di {url}  (hentikan dengan Ctrl+C)")
    uvicorn.run("app.api.main:app", host="127.0.0.1", port=port)


if __name__ == "__main__":
    main()
