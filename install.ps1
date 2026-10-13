# Installs the villager-hp mod for Claude Code on Windows. Paste this line into PowerShell:
#   irm https://raw.githubusercontent.com/Ashley-Pettit/villager-hp/prod/install.ps1 | iex
& {
  $mod = 'villager-hp'
  $catalog = "https://raw.githubusercontent.com/Ashley-Pettit/$mod/prod/catalog.json"

  # Claude Code's own installer puts claude.exe here and does not add it to PATH.
  $claude = Join-Path $HOME '.local\bin\claude.exe'
  if (-not (Test-Path $claude)) {
    $onPath = Get-Command claude -ErrorAction SilentlyContinue
    if ($onPath) {
      $claude = $onPath.Source
    } else {
      Write-Host 'Getting Claude Code first. This can take a minute...'
      Invoke-RestMethod https://claude.ai/install.ps1 | Invoke-Expression
    }
  }
  if (-not (Test-Path $claude)) {
    Write-Host 'Claude Code did not install, so the mod was not added. Paste the line again to retry.' -ForegroundColor Red
    return
  }

  Write-Host "Adding $mod..."
  # Adding fails harmlessly when the catalog was added before; the update picks up a newer version.
  $null = & $claude plugin marketplace add $catalog 2>&1
  $null = & $claude plugin marketplace update $mod 2>&1
  $result = & $claude plugin install "$mod@$mod" 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) {
    Write-Host $result
    Write-Host "$mod was not added. The message above says why." -ForegroundColor Red
    return
  }
  $null = & $claude plugin update "$mod@$mod" 2>&1

  Write-Host ''
  Write-Host "Done. $mod is installed." -ForegroundColor Green
  Write-Host 'Close Claude and open it again. The health card sits above where you type.'
}
