"""Optional: restore the locally bundled sample images and display-font subset.
Run from anywhere: python scripts/fetch-assets.py
The site does not make these requests at runtime.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from urllib.request import Request, urlopen
from urllib.parse import urlencode
import re
import argparse

ROOT = Path(__file__).resolve().parent.parent
IMAGES = {
    'mountains': ('photo-1662607760698-48da7ae83652', 1600),
    'forest': ('photo-1441974231531-c6227db76b6e', 1200),
    'desk': ('photo-1499750310107-5fef28a66643', 1000),
    'architecture': ('photo-1487958449943-2429e8be8625', 1000),
    'coast': ('photo-1475924156734-496f6cac6ec1', 1000),
    'books': ('photo-1507842217343-583bb7270b66', 1000),
}

def download(url, destination):
    destination.parent.mkdir(parents=True, exist_ok=True)
    request = Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urlopen(request, timeout=45) as response:
        destination.write_bytes(response.read())
    print(f'{destination.relative_to(ROOT)} ({destination.stat().st_size // 1024} KB)')

def image(item):
    name, (photo, width) = item
    download(f'https://images.unsplash.com/{photo}?auto=format&fit=crop&w={width}&q=82&fm=webp', ROOT / 'public' / 'images' / f'{name}.webp')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fonts-only', action='store_true', help='Update the display-font subset without downloading photos.')
    args = parser.parse_args()
    if not args.fonts_only:
        with ThreadPoolExecutor(max_workers=6) as pool:
            list(pool.map(image, IMAGES.items()))
    # Only display text is subsetted; body text uses the local system sans serif.
    text = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789., —↗✳'
    for path in (ROOT / 'src').rglob('*'):
        if path.suffix in ('.astro', '.json'):
            text += path.read_text(encoding='utf-8')
        elif path.suffix == '.md':
            text += '\n'.join(line for line in path.read_text(encoding='utf-8').splitlines() if line.startswith('#') or line.startswith('title:') or line.startswith('>'))
    subset = ''.join(sorted(set(re.findall(r'[\u3000-\u9fffA-Za-z0-9., —]', text))))
    query = urlencode({'family': 'Noto Serif SC:wght@500', 'display': 'swap', 'text': subset})
    request = Request('https://fonts.googleapis.com/css2?' + query, headers={'User-Agent': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'})
    with urlopen(request, timeout=45) as response:
        css = response.read().decode('utf-8')
    url = re.search(r'url\(([^)]+)\)', css).group(1)
    download(url, ROOT / 'src' / 'assets' / 'editorial-serif.woff2')
    download('https://raw.githubusercontent.com/google/fonts/main/ofl/notoserifsc/OFL.txt', ROOT / 'public' / 'fonts' / 'OFL.txt')
