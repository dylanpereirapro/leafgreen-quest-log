# Builds the app icons as original pixel art (32x32 grid, scaled with nearest neighbour). Pure Python, no deps.
import zlib, struct, math, os

N = 32
NAVY, DEEP, CREAM, FOLD, EDGE = (28,36,56), (14,19,34), (248,248,240), (220,226,238), (74,111,165)
LEAF, LEAFD, LEAFL, RED, SEA, SEA2 = (92,200,90), (47,138,62), (150,230,120), (232,69,44), (95,143,224), (74,120,200)

def art(full_bleed):
    g = [[None]*N for _ in range(N)]
    def px(x, y, c):
        if 0 <= x < N and 0 <= y < N: g[y][x] = c
    r = 0 if full_bleed else 6
    for y in range(N):
        for x in range(N):
            # rounded-square tile (corners cut unless full bleed)
            cx = min(x, N-1-x); cy = min(y, N-1-y)
            if cx < r and cy < r and (r-cx)**2 + (r-cy)**2 > r*r: continue
            g[y][x] = NAVY
    ox, oy, s = (0, 0, 1)
    # folded map, three panels
    for y in range(9, 26):
        for x in range(5, 27):
            panel = (x - 5) // 7
            c = CREAM if panel % 2 == 0 else FOLD
            if x in (5, 26) or y in (9, 25): c = DEEP
            px(x, y, c)
    # sea patch and land blob on the map
    for y in range(18, 25):
        for x in range(6, 12): px(x, y, SEA if (x+y) % 3 else SEA2)
    # dotted red route to an X
    for x, y in [(8,16),(10,15),(12,14),(14,14),(16,15),(18,16),(20,17)]: px(x, y, RED)
    for d in (-1, 0, 1): px(22+d, 19+d, RED); px(22+d, 19-d, RED)
    # leaf, top right, overlapping the map edge
    for y in range(2, 16):
        for x in range(14, 30):
            u, v = x - 22, y - 9
            a = (u + v) / 1.41; b = (u - v) / 1.41
            if (a/7.2)**2 + (b/3.6)**2 <= 1: px(x, y, LEAF)
    snap = [row[:] for row in g]
    for y in range(2, 16):
        for x in range(14, 30):
            if snap[y][x] == LEAF:
                nb = [snap[y+dy][x+dx] if 0<=y+dy<N and 0<=x+dx<N else None for dx,dy in ((1,0),(-1,0),(0,1),(0,-1))]
                if any(n != LEAF for n in nb): g[y][x] = DEEP
    for i in range(-4, 6): px(22+i, 9-i, LEAFD)          # vein
    px(19, 8, LEAFL); px(20, 7, LEAFL); px(21, 6, LEAFL)  # shine
    for i in range(3): px(16-i, 15+i, DEEP)              # stem
    return g

def png(path, grid, size, pad=0):
    inner = size - 2*pad
    rows = []
    for Y in range(size):
        row = bytearray([0])
        for X in range(size):
            x, y = X - pad, Y - pad
            c = None
            if 0 <= x < inner and 0 <= y < inner:
                c = grid[y * N // inner][x * N // inner]
            if c is None and pad: c = NAVY
            row += bytes((*c, 255)) if c else bytes((0, 0, 0, 0))
        rows.append(bytes(row))
    raw = zlib.compress(b"".join(rows), 9)
    def chunk(t, d): return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)) + chunk(b"IDAT", raw) + chunk(b"IEND", b"")
    open(path, "wb").write(data)

os.makedirs("icons", exist_ok=True)
a = art(False)
for s in (32, 180, 192, 512): png(f"icons/icon-{s}.png", a, s)
png("icons/icon-maskable-512.png", art(True), 512, pad=96)
print("icons written")
