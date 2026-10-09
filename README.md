# villager-hp

Your Claude usage limits as a game health card, drawn above the prompt in Claude Code.

![A healthy villager at full session HP with a gold GOD MODE badge](assets/screenshot-healthy.png)

Two bars, **SESSION** (your 5-hour limit) and **WEEKLY** (your weekly limit across all models), show the hit points you have left. HP is 100 minus the percent used, with the time each one resets. An Age of Empires–style villager watches over them, and his mood follows your lowest bar.

## What it does

- **Live HP.** Readings refresh after every turn and whenever a limit moves by a point. Reset times count down each minute.
- **An animated villager.** He blinks and breathes in every state. At full health he chops away with his pickaxe; as HP falls his swing slows, his head droops, a bandage appears, then tears; near zero he sobs and trembles.
- **Bars that feel alive.** They sweep in, energy stripes flow through them, a shine passes along, and sparks drift off the leading edge. The heart beats faster as HP drops.
- **Sci-fi touches.** Corner brackets, a hologram scan, a radar ring around the villager, crackling arcs on an overcharged bar (90%+ shows **MAX**) and red-alert chevrons on a low one.
- **Rank badges.** A glowing pill at the right of the card: Scout, Contributor, Innovator, Top contributor or GOD MODE.
- **Death.** At 0 HP the villager goes grey, gets X eyes and a halo, and the card reads *Claude has been defeated* with the time you'll be back.

![Low HP: a crying villager, red bars, red-alert chevrons and an Innovator badge](assets/screenshot-low.png)

![Defeated: the villager at 0 HP](assets/screenshot-defeated.png)

## Install

In a Claude Code terminal session:

```
/plugin install villager-hp --marketplace Ashley-Pettit/villager-hp
```

Answer `y` to add the marketplace and press Enter for the user scope. The card appears above the prompt, in the terminal and in the desktop app's Code tab. The desktop app draws the full animated card; a terminal draws a text version.

## Commands

| Command | What it does |
| --- | --- |
| `/hp` | Show both bars as text |
| `/hp 40` | Preview the card at any HP from 0 to 100 |
| `/hp off` | Back to your real limits |
| `/die` | Watch Claude die (same as `/hp 0`) |
| `/revive` | Bring Claude back to your real limits |
| `/rank top` | Change your badge: `scout`, `contributor`, `innovator`, `top` or `god` |

## What it can reach

It reads your session's usage figures and keeps your chosen rank in its own small store. It makes no network calls, starts no processes, and reads or writes no files of yours.

Readings appear on Claude subscriptions, which report rate-limit windows; on API keys the bars show `—` until a reading arrives.

## License

MIT
