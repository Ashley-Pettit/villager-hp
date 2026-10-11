# villager-hp

Your Claude usage limits as a game health card, drawn above the prompt in Claude Code.

villager-hp is a Claude Code mod (a plugin). It turns your 5-hour session limit and your weekly limit into two health bars, tells you when the week is on pace to run out early, and puts an animated villager beside them who feels every point you spend.

[![What the scanner says this mod can reach](https://raw.githubusercontent.com/karanb192/awesome-claude-code-mods/main/badges/Ashley-Pettit--villager-hp--villager-hp-reach.svg)](https://mods.aidojo.si/#Ashley-Pettit--villager-hp--villager-hp)
[![Validation result](https://raw.githubusercontent.com/karanb192/awesome-claude-code-mods/main/badges/Ashley-Pettit--villager-hp--villager-hp-validates.svg)](https://mods.aidojo.si/#Ashley-Pettit--villager-hp--villager-hp)

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
- It needs Claude Code 2.1.287 or later. This version was tested on 2.1.295.

Already have it? To get the newest version, run this in a terminal (not inside Claude Code), then restart Claude Code:

```
claude plugin update villager-hp@villager-hp
```

## What you see

Two bars, **SESSION** (your 5-hour limit) and **WEEKLY** (your weekly limit across all models), show the hit points you have left. HP is 100 minus the percent used, with the time each one resets. An Age of Empires–style villager watches over them, and his mood follows your lowest bar.

## What it does

- **Live HP.** Readings refresh after every turn and whenever a limit moves by a point. Reset times count down each minute.
- **Weekly pace.** The card works out whether your weekly limit will last until it resets if you keep going at the same rate. If it won't, an hourglass floats at the villager's shoulder with its sand running out, and `/pace` tells you when you'd run out. It makes no call in a week's first 12 hours, when one busy sitting would look like a blown week.
- **An animated villager.** He blinks and breathes in every state. He grins and chops away with his pickaxe for as long as the bar is green; as HP falls his swing slows, his head droops, a bandage appears, then tears; near zero he sobs and trembles.
- **Bars that feel alive.** They sweep in, energy stripes flow through them, a shine passes along, and sparks drift off the leading edge. The heart beats faster as HP drops.
- **Sci-fi touches.** Corner brackets, a hologram scan, a radar ring around the villager, crackling arcs on an overcharged bar (90%+; a full one shows **MAX**) and red-alert chevrons on a low one.
- **Rank badges.** A glowing pill at the right of the card: Scout, Contributor, Innovator, Top contributor or GOD MODE.
- **Death.** At 0 HP the villager goes grey, gets X eyes and a halo, and the card reads *Claude has been defeated* with the time you'll be back.

![Low HP: a crying villager, red bars, red-alert chevrons and an Innovator badge](assets/screenshot-low.png)

![Defeated: the villager at 0 HP](assets/screenshot-defeated.png)

## Commands

| Command | What it does |
| --- | --- |
| `/hp` | Show both bars and your weekly pace as text |
| `/hp 40` | Preview the card at any HP from 0 to 100 |
| `/hp off` | Back to your real limits |
| `/die` | Watch Claude die (same as `/hp 0`) |
| `/revive` | Bring Claude back to your real limits |
| `/rank top` | Change your badge: `scout`, `contributor`, `innovator`, `top` or `god` |
| `/pace` | Say whether your weekly limit lasts at this rate, and when it runs out if not |
| `/pace over` | Preview the hourglass warning (`/pace ok` previews being on track) |
| `/pace off` | Back to your real pace |

In a terminal, an over-pace week adds `⏳ out by Thu 3pm` to the WEEKLY row.

## What it can reach

It reads your session's usage figures and keeps your chosen rank in its own small store. It makes no network calls, starts no processes, and reads or writes no files of yours.

Readings appear on Claude subscriptions, which report rate-limit windows; on API keys the bars show `—` until a reading arrives.

## What's new

- **2.8** Weekly pace: an hourglass when the week is on course to run out before it resets, plus `/pace`. The villager stays cheerful for as long as the bar is green.
- **2.5** The animated villager, rank badges and the death screen.

## Find it elsewhere

- [Awesome Claude Code Mods](https://github.com/karanb192/awesome-claude-code-mods), under Dashboards and usage, and its [searchable catalogue](https://mods.aidojo.si/#Ashley-Pettit--villager-hp--villager-hp), which shows what every listed mod can read, write, run or send.

## More mods by Ash

- [lgtm-flash](https://github.com/Ashley-Pettit/lgtm-flash): a container ship sails past and drops L, G, T and M on its deck every time Claude changes your code.

## License

MIT
