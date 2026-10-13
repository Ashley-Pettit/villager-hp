#!/bin/bash
# Installs the villager-hp mod for Claude Code on a Mac or Linux. Paste this line into Terminal:
#   curl -fsSL https://raw.githubusercontent.com/Ashley-Pettit/villager-hp/prod/install.sh | bash
mod=villager-hp
catalog="https://raw.githubusercontent.com/Ashley-Pettit/$mod/prod/catalog.json"

# Claude Code's own installer puts claude here and does not add it to PATH.
claude="$HOME/.local/bin/claude"
if [ ! -x "$claude" ]; then
  if command -v claude >/dev/null 2>&1; then
    claude=$(command -v claude)
  else
    echo 'Getting Claude Code first. This can take a minute...'
    curl -fsSL https://claude.ai/install.sh | bash
  fi
fi
if [ ! -x "$claude" ]; then
  echo 'Claude Code did not install, so the mod was not added. Paste the line again to retry.'
  exit 1
fi

echo "Adding $mod..."
# This script arrives on stdin, so every claude call reads from /dev/null instead.
# Adding fails harmlessly when the catalog was added before; the update picks up a newer version.
"$claude" plugin marketplace add "$catalog" </dev/null >/dev/null 2>&1
"$claude" plugin marketplace update "$mod" </dev/null >/dev/null 2>&1
if ! result=$("$claude" plugin install "$mod@$mod" </dev/null 2>&1); then
  echo "$result"
  echo "$mod was not added. The message above says why."
  exit 1
fi
"$claude" plugin update "$mod@$mod" </dev/null >/dev/null 2>&1

echo
echo "Done. $mod is installed."
echo 'Close Claude and open it again. The health card sits above where you type.'
