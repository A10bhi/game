"""
Twogether relay server
-----------------------
A tiny WebSocket server that lets two browsers in a "room" pass messages
through it. This replaces peer-to-peer (WebRTC) connections, which are
unreliable across two arbitrary, different networks. A plain relay server
that both sides can always reach is far more predictable.

Deliberately written with ZERO third-party dependencies (no `websockets`,
no `flask`, nothing to `pip install`) — the WebSocket protocol itself is
implemented directly on top of asyncio's raw TCP streams. That keeps the
one thing that can go wrong on deploy (installing packages) out of the
picture entirely.

Protocol (JSON messages over the WebSocket):
  Client -> Server
    {"type": "join", "room": "ABCDE", "name": "Alex"}
    {"type": "relay", "action": "game", "data": {...}}   # forwarded as-is
                                                          # to the other peer
  Server -> Client
    {"type": "joined", "room": "ABCDE"}
    {"type": "peer-joined", "name": "Sam"}
    {"type": "peer-left"}
    {"type": "relay", "action": "...", "data": {...}}
    {"type": "error", "message": "..."}

Run locally:   python3 server.py            (listens on PORT, default 10000)
Deploy: see the README in this folder.
"""

import asyncio
import base64
import hashlib
import json
import os
import struct

WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
MAX_PER_ROOM = 2

# room_code -> list of {"writer": StreamWriter, "name": str}
rooms = {}


def make_accept_key(client_key: str) -> str:
    digest = hashlib.sha1((client_key + WS_GUID).encode()).digest()
    return base64.b64encode(digest).decode()


async def read_http_headers(reader: asyncio.StreamReader):
    """Read a raw HTTP request line + headers. Returns (None, {}) on EOF."""
    request_line = await reader.readline()
    if not request_line:
        return None, {}
    headers = {}
    while True:
        line = await reader.readline()
        if line in (b"\r\n", b"\n", b""):
            break
        if b":" in line:
            k, v = line.decode("latin-1", errors="ignore").split(":", 1)
            headers[k.strip().lower()] = v.strip()
    return request_line, headers


def encode_frame(payload: bytes, opcode: int = 0x1) -> bytes:
    """Build a server->client frame. Server frames are never masked."""
    fin_opcode = 0x80 | opcode
    length = len(payload)
    if length <= 125:
        header = struct.pack("!BB", fin_opcode, length)
    elif length <= 0xFFFF:
        header = struct.pack("!BBH", fin_opcode, 126, length)
    else:
        header = struct.pack("!BBQ", fin_opcode, 127, length)
    return header + payload


async def read_frame(reader: asyncio.StreamReader):
    """Read one client->server frame. Client frames are always masked."""
    first2 = await reader.readexactly(2)
    b1, b2 = first2[0], first2[1]
    opcode = b1 & 0x0F
    masked = (b2 & 0x80) != 0
    length = b2 & 0x7F
    if length == 126:
        length = struct.unpack("!H", await reader.readexactly(2))[0]
    elif length == 127:
        length = struct.unpack("!Q", await reader.readexactly(8))[0]
    mask_key = await reader.readexactly(4) if masked else b""
    payload = await reader.readexactly(length) if length else b""
    if masked:
        payload = bytes(b ^ mask_key[i % 4] for i, b in enumerate(payload))
    return opcode, payload


async def send_json(writer: asyncio.StreamWriter, obj: dict) -> bool:
    try:
        writer.write(encode_frame(json.dumps(obj).encode("utf-8")))
        await writer.drain()
        return True
    except Exception:
        return False


def remove_client(room_code, client_info):
    peers = rooms.get(room_code)
    if not peers:
        return
    peers[:] = [p for p in peers if p is not client_info]
    if not peers:
        rooms.pop(room_code, None)


async def handle_client(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
    request_line, headers = await read_http_headers(reader)
    if request_line is None:
        writer.close()
        return

    # Anything that isn't a WebSocket upgrade gets a plain 200 — this is
    # what lets a health check (or a curious visitor's browser) hit the
    # root URL and get a sane response instead of a protocol error.
    if headers.get("upgrade", "").lower() != "websocket" or "sec-websocket-key" not in headers:
        body = b"Twogether relay server is running.\n"
        writer.write(
            b"HTTP/1.1 200 OK\r\n"
            b"Content-Type: text/plain\r\n"
            b"Content-Length: " + str(len(body)).encode() + b"\r\n"
            b"Connection: close\r\n\r\n" + body
        )
        try:
            await writer.drain()
        except Exception:
            pass
        writer.close()
        return

    accept_key = make_accept_key(headers["sec-websocket-key"])
    writer.write(
        ("HTTP/1.1 101 Switching Protocols\r\n"
         "Upgrade: websocket\r\n"
         "Connection: Upgrade\r\n"
         f"Sec-WebSocket-Accept: {accept_key}\r\n\r\n").encode()
    )
    await writer.drain()

    room_code = None
    client_info = None

    try:
        while True:
            opcode, payload = await read_frame(reader)

            if opcode == 0x8:  # close
                break
            if opcode == 0x9:  # ping -> pong
                writer.write(encode_frame(payload, opcode=0xA))
                await writer.drain()
                continue
            if opcode == 0xA:  # pong
                continue
            if opcode != 0x1:  # only text frames carry our JSON
                continue

            try:
                msg = json.loads(payload.decode("utf-8"))
            except (ValueError, UnicodeDecodeError):
                continue

            mtype = msg.get("type")

            if mtype == "join":
                code = str(msg.get("room", "")).strip().upper()
                name = str(msg.get("name", "Friend")).strip()[:24] or "Friend"
                if not code:
                    await send_json(writer, {"type": "error", "message": "Missing room code"})
                    continue
                peers = rooms.setdefault(code, [])
                if len(peers) >= MAX_PER_ROOM:
                    await send_json(writer, {"type": "error", "message": "That room already has two players"})
                    continue
                room_code = code
                client_info = {"writer": writer, "name": name}
                for p in peers:
                    await send_json(p["writer"], {"type": "peer-joined", "name": name})
                    await send_json(writer, {"type": "peer-joined", "name": p["name"]})
                peers.append(client_info)
                await send_json(writer, {"type": "joined", "room": room_code})

            elif mtype == "relay" and room_code:
                for p in rooms.get(room_code, []):
                    if p is not client_info:
                        await send_json(p["writer"], {
                            "type": "relay",
                            "action": msg.get("action"),
                            "data": msg.get("data"),
                        })

    except (asyncio.IncompleteReadError, ConnectionResetError, BrokenPipeError):
        pass
    finally:
        if room_code and client_info:
            remove_client(room_code, client_info)
            for p in rooms.get(room_code, []):
                await send_json(p["writer"], {"type": "peer-left"})
        try:
            writer.close()
        except Exception:
            pass


async def main():
    port = int(os.environ.get("PORT", 10000))
    server = await asyncio.start_server(handle_client, "0.0.0.0", port)
    print(f"Twogether relay server listening on 0.0.0.0:{port}")
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    asyncio.run(main())
