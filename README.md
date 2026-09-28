# LeafGreen Quest Log

A game-style companion for playing Pokémon LeafGreen on a foldable phone.

- **Folded (cover screen or split screen):** Quest HUD. Next quest, tappable steps, reward, tip, badge case, dex counter. One screen, no scrolling.
- **Unfolded (inner screen):** World Map. Code-drawn pixel map of Kanto and the Sevii Islands, pinch and pan, fog of war, a trainer who walks to your next quest, quest log panel on the right.
- Switches live when you fold or unfold. Same save in both.
- START menu: Map, Quests, Collection, Pokédex, Options (sound, text speed, motion, save code export and import, reset).
- Installable PWA. Works offline after the first visit.

All art and sound are original and drawn in code. Game facts checked against Bulbapedia (see `CHANGES.md`). Fan-made, not affiliated with Nintendo, Creatures or Game Freak.

## Files

| Path | What |
|---|---|
| `js/data.js` | All game data: quests, map spots, routes, collections |
| `js/world.js` | Builds and paints the tile maps |
| `js/map.js` | Camera, touch, fog, markers, walking trainer |
| `js/ui.js`, `js/main.js` | HUD, menus, text box, mode switching |
| `js/state.js` | Save, load, save codes |
| `js/audio.js` | Chiptune sound effects (Web Audio) |
| `sw.js`, `manifest.webmanifest` | Offline and install |

## Run and test

```
python3 -m http.server 8787
npm install && node tests/run.mjs
```

After changing any file, bump `VERSION` in `sw.js` so phones pick up the new copy.
