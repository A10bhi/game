# Twogether relay server

A small Python program that lets two browsers on two different networks
find each other and pass game messages back and forth. This replaces the
peer-to-peer connection, which turned out to be too unreliable across
unrelated home/mobile networks. `server.py` has **zero third-party
dependencies** — it implements just enough of the WebSocket protocol
directly on `asyncio`, so there's nothing to `pip install` and nothing
version-specific that can fail to install on the host.

You only need to do this once. It's a separate deploy from the website
itself (which stays on GitHub Pages).

## Deploy it on Render (free)

1. Go to **[render.com](https://render.com)** and sign up (GitHub login is
   easiest — no credit card required for the free tier).
2. Click **New +** → **Web Service**, and connect the same GitHub repo you
   used for the website.
3. Fill in the settings:
   - **Root Directory:** `server` (this tells Render to only build/run
     what's in this folder — important, since your repo also has the
     website files alongside it)
   - **Language / Runtime:** `Python 3`
   - **Build Command:** *(leave blank — there's nothing to install)*
   - **Start Command:** `python server.py`
   - **Instance Type:** `Free`
4. Click **Create Web Service**. Render will build and start it — watch
   the **Logs** tab for `Twogether relay server listening on 0.0.0.0:...`.
5. Copy the URL Render gives your service (looks like
   `https://twogether-relay.onrender.com`).
6. Open `js/network.js` in the website files, find this line near the top:
   ```js
   const SERVER_URL = 'wss://YOUR-SERVICE-NAME.onrender.com';
   ```
   Replace it with your actual URL, **changing `https://` to `wss://`**
   (same address, just the WebSocket version of it). Commit and push — the
   website half of the repo redeploys on GitHub Pages as usual.

That's it. Both of you open the site, one creates a room, the other
joins — the two browsers now talk through this server instead of trying
to connect directly to each other.

## Good to know

- **Free tier sleeps.** If nobody's used it in the last 15 minutes, Render
  spins the service down. The next connection wakes it back up, but that
  first request can take **30–60 seconds**. If a room seems stuck on
  "waiting" right after a long gap since anyone last played, that's almost
  always why — give it a minute before assuming something's wrong.
- **No accounts, no database.** Rooms exist only in memory while the
  server is running, and only track which two connections are in which
  room so it can relay messages between them — it doesn't store or log
  any game content.
- **Only two people per room code.** A third connection to the same code
  gets a "room already has two players" message instead of joining.
