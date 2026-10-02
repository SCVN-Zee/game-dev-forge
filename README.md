# Game Dev Forge

A native macOS app for Unity project setup and maintenance.

## Install

**Requires an Apple Silicon Mac.**

1. Download the latest `.dmg` from
   [GitHub Releases](https://github.com/SCVN-Zee/game-dev-forge/releases/latest).
2. Open the `.dmg` and drag **Game Dev Forge** into **Applications**.
3. The app is unsigned. If macOS reports that it is damaged or from an
   unidentified developer, open **Terminal** and remove its quarantine flag:

   ```sh
   xattr -dr com.apple.quarantine "/Applications/Game Dev Forge.app"
   ```

   Repeat this step if macOS blocks a manually downloaded replacement.
4. Launch **Game Dev Forge** from Applications.

## Features

- **Fork** — configure [Fork](https://git-fork.com) to merge Unity YAML assets
  with `UnityYAMLMerge`, with optional project `.gitattributes` setup.
  Requires Fork to be installed.
- **Git setup** — install Unity `.gitignore`, local excludes, and Git LFS
  tracking rules; manage local submodule ignore settings and template presets.
- **Initialize** — create an editable Supercent folder hierarchy in a Unity
  project, with reusable layouts and a dry-run preview.
- **Settings** — choose the Unity projects root, run Doctor, and select the
  Stable or Beta update channel.

## Updates

Open **Settings → Updates** or **Game Dev Forge → Check for Updates…**. Installed
Apple Silicon builds also check at startup. Stable is the default; Beta opts
into prereleases. Switching back to Stable never downgrades the app.

Download and installation each require confirmation. Updates replace only the
app after active project operations finish; settings and projects stay in place.
The complete ZIP is verified against GitHub’s SHA-256 digest; blockmaps are not
needed. Manual DMG installation remains available if updating is blocked.

Install the first updater-enabled release manually: older builds cannot update
themselves. Ad-hoc/self-signed releases may still require macOS approval; the
updater does not disable Gatekeeper.
