"""
集中治療認証看護師 過去問アプリ ローカル起動スクリプト
ダブルクリックまたはターミナルから実行することで、PCおよびスマホから利用できます。
"""
import http.server
import socketserver
import webbrowser
import socket
import os
import sys

PORT = 8080

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

def main():
    app_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(app_dir)

    Handler = http.server.SimpleHTTPRequestHandler
    
    # 拡張子のMIMEタイプ設定
    Handler.extensions_map.update({
        '.json': 'application/json',
        '.svg': 'image/svg+xml',
    })

    local_ip = get_local_ip()
    url_local = f"http://localhost:{PORT}"
    url_mobile = f"http://{local_ip}:{PORT}"

    print("=" * 60)
    print("  集中治療認証看護師 過去問演習アプリ 起動中...")
    print("=" * 60)
    print(f"  [PCで利用する場合]   -> {url_local}")
    print(f"  [スマホで利用する場合] -> {url_mobile} (同一Wi-Fi内)")
    print("=" * 60)
    print("  ※ 終了するには Ctrl + C を押してください。\n")

    # ブラウザ自動起動
    webbrowser.open(url_local)

    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nサーバーを停止しました。")

if __name__ == "__main__":
    main()
