# villager-hp

Your Claude usage limits as a game health card, drawn above the prompt in Claude Code.

villager-hp is a Claude Code mod (a plugin). It turns your 5-hour session limit and your weekly limit into two health bars, shows whether the week is on pace to run out early, and puts an animated villager beside them who feels every point you spend.

[![What the scanner says this mod can reach](https://raw.githubusercontent.com/karanb192/awesome-claude-code-mods/main/badges/Ashley-Pettit--villager-hp--villager-hp-reach.svg)](https://mods.aidojo.si/#Ashley-Pettit--villager-hp--villager-hp)
[![Validation result](https://raw.githubusercontent.com/karanb192/awesome-claude-code-mods/main/badges/Ashley-Pettit--villager-hp--villager-hp-validates.svg)](https://mods.aidojo.si/#Ashley-Pettit--villager-hp--villager-hp)

![A healthy villager at full session HP](assets/screenshot-healthy.png)

## How to install

You paste one line. It works even if you only have the Claude desktop app.

### Windows

1. Press the Start button, type `powershell` and press Enter. A window opens.
2. Copy this line, paste it into that window and press Enter:

   ```
   irm https://raw.githubusercontent.com/Ashley-Pettit/villager-hp/prod/install.ps1 | iex
   ```

3. Wait until it says **Done**. Then close Claude and open it again.

### Mac

1. Press Command and Space, type `terminal` and press Enter. A window opens.
2. Copy this line, paste it into that window and press Enter:

   ```
   curl -fsSL https://raw.githubusercontent.com/Ashley-Pettit/villager-hp/prod/install.sh | bash
   ```

3. Wait until it says **Done**. Then close Claude and open it again.

### Try it

In the Claude desktop app, open the Code tab. The health card sits above where you type. Type `/hp 40` and press Enter to see it at 40 HP.

Good to know:

- The line gets Claude Code's command-line tool if you don't have it, then adds the mod. It asks no questions and needs no admin password.
- It keeps itself up to date: once a day it checks for a newer version and installs it, then tells you to restart Claude. Type `/hp update` to check now, or `/hp autoupdate off` to be told instead. Pasting the line again also updates it.
- The full animated card shows in the desktop app's Code tab. If you run Claude Code in a terminal you get a simpler text version.
- It needs Claude Code 2.1.287 or later. This version was tested on 2.1.295.
- Already use Claude Code in a terminal? You can type `/plugin install villager-hp --marketplace Ashley-Pettit/villager-hp` there instead.

## What you see

Three bars: **SESSION** (your 5-hour limit) and **WEEKLY** (your weekly limit across all models) show the hit points you have left, and **PACE** shows whether this week's rate gets you to the reset. On Ultra, SESSION is hidden (see below). HP is 100 minus the percent used, with the time each one resets. An Age of Empires–style villager watches over them, and his mood follows your lowest bar.

## Weekly pace bar

**PACE** sits under **WEEKLY**:

- The middle line is on track: at this rate you use exactly your weekly limit by the reset.
- The marker sits **right** of the middle when you have plenty spare, and **left** when you'll hit the cap before the reset.
- Beside it: the percent of the limit you'd use by the reset, and "42% spare", "on track" or "over pace".

## Ultra accounts

On an Ultra plan the 5-hour window doesn't apply, so the card hides **SESSION** and shows just **WEEKLY** and **PACE**. The card works this out by itself (a weekly limit with no 5-hour one, or "ultra" in the account's plan name). To set it by hand, type `/ultra on`, `/ultra off` or `/ultra auto`.

## Open: your artifacts, docs and videos

Type `/open` to open a pane listing your claude.ai artifacts, and the Word docs and videos in your Desktop, Documents, Downloads, Movies, Videos and OneDrive folders.

- Most recently edited at the top.
- Press ☆ to pin something; pinned things stay at the top, across sessions. Press ★ to unpin.
- Tabs narrow the list to Artifacts, Docs or Videos. Refresh looks again.
- An artifact opens in your browser; a doc or video opens in its own app.

At the right end of the card, **LAST PROMPT** shows your most recent prompt's rough cost at API rates, with the new tokens it used underneath: what you sent, what Claude wrote and what was newly cached, leaving out the chat Claude re-reads from cache each turn. The cost is Claude Code's own estimate (what `/cost` shows) where it gives one, else worked out from the tokens at published API prices; it's converted at a daily exchange rate, and on a subscription you aren't billed it. `/hp` gives the full breakdown.

## AI usage and settings

The pane `/open` opens has three tabs:

- **Library:** your artifacts, docs and videos (above).
- **AI usage:** rough cost, new tokens and prompts today, over 7 days and over 30 days, a 14-day chart, and a day-by-day list. It counts every session from when 2.11 was installed and keeps 90 days. `/hp usage` opens it.
- **Settings:** the currency for costs (AUD by default; also a row in `/config`), the Ultra layout, auto update, and a Check for updates button. `/hp settings` opens it.

## What it does

- **Live HP.** Readings refresh after every turn and whenever a limit moves by a point. Reset times count down each minute.
- **Weekly pace.** The PACE bar works out whether your weekly limit will last until it resets if you keep going at the same rate. If it won't, the bar's marker sits left of the middle in red, with the percent of the limit you'd use, and `/pace` says what percent of the limit you'd use by the reset. It makes no call in a week's first 12 hours, when one busy sitting would look like a blown week.
- **An animated villager.** He blinks and breathes in every state. He grins and chops away with his pickaxe for as long as the bar is green; as HP falls his swing slows, his head droops, a bandage appears, then tears; near zero he sobs and trembles.
- **Bars that feel alive.** They sweep in, energy stripes flow through them, a shine passes along, and sparks drift off the leading edge. The heart beats faster as HP drops.
- **Sci-fi touches.** Corner brackets, a hologram scan, a radar ring around the villager, crackling arcs on an overcharged bar (90%+; a full one shows **MAX**) and red-alert chevrons on a low one.
- **`/open`.** Your artifacts, Word docs and videos, newest first, with pins.
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
| `/open` | Open your artifacts, Word docs and videos, AI usage and settings |
| `/hp usage` | Your AI usage history: tokens and rough cost per day |
| `/hp settings` | Currency, Ultra layout and auto update |
| `/hp update` | Check for a newer villager-hp and install it (restart Claude to use it) |
| `/hp version` | Say which version you have and whether a newer one is out |
| `/hp autoupdate off` | Tell you about new versions instead of installing them (`on` to go back) |
| `/ultra on` | Ultra layout: hide SESSION (`/ultra off`, `/ultra auto`) |
| `/pace` | Say whether your weekly limit lasts at this rate, as a percent of the limit by the reset |
| `/pace over` | Preview being over pace (`/pace ok` previews being on track) |
| `/pace off` | Back to your real pace |

In a terminal, the PACE row shows the same as the card.

## What it can reach

It reads your session's usage figures and keeps your pins and `/ultra` choice in its own small store. When you open the Open pane it also:

- lists your artifacts through Claude Code's Artifact tool (a call to claude.ai, signed in as you);
- lists file names in your Desktop, Documents, Downloads, Movies, Videos and OneDrive folders, looking for Word docs and videos. It reads names and dates only, never what's in the files;
- opens the file you press with your computer's own `open`, `explorer.exe` or `xdg-open`.

Once a day it fetches an exchange rate from open.er-api.com (for the cost in your currency), and this repository's `plugin.json` from GitHub to see whether a newer version is out, and if so runs Claude Code's own `claude plugin update villager-hp@villager-hp` (unless you turned auto update off).

Your pins, settings and AI usage history stay in its own small store on your computer. It writes no files of yours.

Readings appear on Claude subscriptions, which report rate-limit windows; on API keys the bars show `—` until a reading arrives.

## What's new

- **2.11** The last prompt's rough cost at API rates and new tokens, in your currency (`/hp` for the breakdown). AI usage history and Settings tabs. A nicer OPEN button and library (search, counts, cards grouped by Today, This week and Earlier). No more hourglass, cap date or over-pace chip: the PACE bar's marker and percent show it.
- **2.10** Updates itself: a daily check that installs a newer version, `/hp update` to check now, `/hp autoupdate off` to be told instead.
- **2.9** A PACE bar under WEEKLY (SESSION hidden on Ultra), the OPEN pane for your artifacts, docs and videos with pins, and the last prompt's tokens.
- **2.8** Weekly pace: an hourglass when the week is on course to run out before it resets, plus `/pace`. The villager stays cheerful for as long as the bar is green.
- **2.5** The animated villager, rank badges and the death screen.

## Find it elsewhere

- [Awesome Claude Code Mods](https://github.com/karanb192/awesome-claude-code-mods), under Dashboards and usage, and its [searchable catalogue](https://mods.aidojo.si/#Ashley-Pettit--villager-hp--villager-hp), which shows what every listed mod can read, write, run or send.

## More mods by Ash

- [lgtm-flash](https://github.com/Ashley-Pettit/lgtm-flash): a container ship sails past and drops L, G, T and M on its deck every time Claude changes your code.

## License

MIT
