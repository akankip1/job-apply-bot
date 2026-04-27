# Command Line Aliases

## PowerShell

Add this to your PowerShell profile if you want `gs` to run `git status`:

```powershell
function gs {
  git status @args
}
```

Open your PowerShell profile with:

```powershell
notepad $PROFILE
```

If the profile file does not exist yet:

```powershell
New-Item -ItemType File -Force $PROFILE
notepad $PROFILE
```

After saving, restart PowerShell or run:

```powershell
. $PROFILE
```

Then use:

```powershell
gs
```

## Git Alias

This creates a Git-native alias, so `git s` runs `git status`:

```powershell
git config --global alias.s status
```

Then use:

```powershell
git s
```
