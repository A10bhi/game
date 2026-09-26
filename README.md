# 🎮 Twogether

A little multiplayer game site for you and a friend — live rooms, real-time
play, two-part deploy (both free).

**Games included**
- **Dots & Boxes** — the pen-and-paper classic. Take turns, complete a box, go again.
- **Mind Meld** — answer privately, reveal together, see how well you sync up.
- **Rally Race** — a real-time top-down race, 3 laps, arrow keys or WASD.

## How the multiplayer works

Two parts:

1. **The website** (this folder, minus `server/`) — plain HTML/CSS/JS,
   hosted free on GitHub Pages, exactly like before.
2. **A small relay server** (`server/`) — a Python program with no
   third-party dependencies that sits in the middle and passes messages
   between the two of you. **You need to deploy this too — the site won't
   connect without it.** See `server/README.md`; it takes about five
   minutes on Render's free tier.

Earlier versions of this project tried a direct peer-to-peer (WebRTC)
connection with no server at all. That's elegant when it works, but it
depends on both people's home/mobile networks being willing to punch a
direct connection through to each other — which turned out to be
unreliable enough that it just didn't work for two people on two
different networks. A relay server both browsers can always reach removes
that whole problem.

## Deploy it

1. **Set up the relay server first** — follow `server/README.md`. You'll
   end up with a URL like `https://twogether-relay.onrender.com`.
2. **Paste that URL into the website code.** Open `js/network.js`, find
   `const SERVER_URL = 'wss://YOUR-SERVICE-NAME.onrender.com';` near the
   top, and replace it with your real URL (keep the `wss://`, just swap in
   your service name).
3. **Create a new GitHub repository** (public — free GitHub Pages hosting
   requires a public repo unless you're on a paid plan) and push
   everything to it, `server/` folder included:
   ```
   git init
   git add .
   git commit -m "Twogether game site"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```
4. **Turn on Pages**: in the repo, go to **Settings → Pages**. Under
   "Build and deployment", set **Source** to *Deploy from a branch*, pick
   the **main** branch and the **/ (root)** folder, then **Save**.
5. Wait a minute, then visit `https://<your-username>.github.io/<your-repo>/`.
   GitHub shows the live URL at the top of the Pages settings once it's ready.
6. Send that link to your friend. One of you clicks **Create a room**, the
   other clicks **Join a room** (or better: use the **🔗 Copy invite link**
   button from the lobby, which avoids typing the code at all). Pick a
   game together and you're playing.

## If you can't connect

- **Did you deploy `server/` and update `SERVER_URL`?** This is the most
  common thing to miss — the site does nothing without it. Open your
  browser console (F12 → Console) in the lobby; if you see a message about
  `SERVER_URL` being a placeholder, that's it.
- **First connection in a while?** Render's free tier puts the server to
  sleep after 15 minutes of no activity. Waking back up can take
  30–60 seconds — give it a minute before assuming something's broken.
- **Exact same room code?** The invite-link button sidesteps this
  entirely — prefer it over reading the code aloud.
- **Still stuck?** Dev tools console (F12) on both sides, look for red
  errors, and check the **Logs** tab on your Render service — between the
  two you'll see exactly where it's failing.

## Customizing

- **Colors, fonts, general look** — all in `css/style.css`, driven by the
  CSS variables at the top of the file.
- **Mind Meld questions** — edit the `QUESTIONS` array at the top of
  `games/match-game.js`. Each entry is either `{ type: 'choice', q, options }`
  or `{ type: 'text', q }`.
- **Race track / laps** — constants near the top of `games/race.js`
  (`LAPS_TO_WIN`, track radius `R`, etc).
- **The relay server** — `server/server.py` is one plain file; the room
  logic (join, relay, room-full, disconnect) is all near the bottom of it
  if you want to extend it (e.g. more than 2 players).

## Project structure

```
index.html              Home page — name, create/join room
lobby.html              Waiting room + game picker
css/style.css           Shared design system
js/network.js           WebSocket connection to the relay server (shared by every page)
js/home.js              Home page logic
js/lobby.js             Lobby logic
games/dots-and-boxes.{html,js}
games/match-game.{html,js}
games/race.{html,js}
server/server.py         The relay server — deployed separately, see server/README.md
server/README.md         Deployment instructions for the server
```

The website has no build step and no dependencies — plain HTML/CSS/JS,
runs directly on GitHub Pages as-is. The server has no dependencies either
(pure standard-library Python) — the only extra step is deploying it
somewhere that can keep a process running, since GitHub Pages can't.
