# Game Dev Forge

A native macOS app for Unity project setup and maintenance.

## Install

**Requires an Apple Silicon Mac.**

1. Download the latest `Game Dev Forge-<version>-arm64.dmg` from
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
- **Settings** — choose the Unity projects root and check your environment
  with Doctor.
