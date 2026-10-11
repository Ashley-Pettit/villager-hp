# villager-hp

Your Claude usage limits as a game health card, drawn above the prompt in Claude Code.

![A healthy villager at full session HP with a gold GOD MODE badge](assets/screenshot-healthy.png)

## How to install

It takes about a minute. You need [Claude Code](https://claude.com/claude-code) on your computer first.

1. **Open a terminal.** On Windows, open PowerShell. On a Mac, open Terminal.
2. **Start Claude Code.** Type `claude` and press Enter.
3. **Copy this line, paste it in, and press Enter:**

   ```
   /plugin install villager-hp --marketplace Ashley-Pettit/villager-hp
   ```

4. **Answer two questions.** For the first, type `y` and press Enter. For the second, just press Enter.
5. **Try it.** The health card appears above where you type. Type `/hp 40` and press Enter to see it at 40 HP.

Good to know:

- The line in step 3 only works in the terminal. Pasting it into the Claude desktop app or the Claude website does nothing.
- You only do this once. After that it also shows up in the Claude desktop app's Code tab.
- The full animated card shows in the desktop app's Code tab. In a terminal you get a simpler text version.

## What you see

Two bars, **SESSION** (your 5-hour limit) and **WEEKLY** (your weekly limit across all models), show the hit points you have left. HP is 100 minus the percent used, with the time each one resets. An Age of Empires–style villager watches over them, and his mood follows your lowest bar.

## What it does

- **Live HP.** Readings refresh after every turn and whenever a limit moves by a point. Reset times count down each minute.
- **An animated villager.** He blinks and breathes in every state. At full health he chops away with his pickaxe; as HP falls his swing slows, his head droops, a bandage appears, then tears; near zero he sobs and trembles.
- **Bars that feel alive.** They sweep in, energy stripes flow through them, a shine passes along, and sparks drift off the leading edge. The heart beats faster as HP drops.
- **Sci-fi touches.** Corner brackets, a hologram scan, a radar ring around the villager, crackling arcs on an overcharged bar (90%+; a full one shows **MAX**) and red-alert chevrons on a low one.
- **Rank badges.** A glowing pill at the right of the card: Scout, Contributor, Innovator, Top contributor or GOD MODE.
- **Death.** At 0 HP the villager goes grey, gets X eyes and a halo, and the card reads *Claude has been defeated* with the time you'll be back.

![Low HP: a crying villager, red bars, red-alert chevrons and an Innovator badge](assets/screenshot-low.png)

![Defeated: the villager at 0 HP](assets/screenshot-defeated.png)

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

## More mods by Ash

- [lgtm-flash](https://github.com/Ashley-Pettit/lgtm-flash): a container ship sails past and drops L, G, T and M on its deck every time Claude changes your code.

## License

MIT
