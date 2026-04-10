# Installing Handoff

## What You Need

- After Effects 2022 or later (version 22.0+)
- A free ZXP installer app (see Step 1)

## Installation

### Step 1: Get a ZXP installer

Download and install **one** of these free tools (if you don't already have one):

- **aescripts ZXP Installer** (recommended): https://aescripts.com/learn/zxp-installer/
- **Anastasiy's Extension Manager**: https://install.anastasiy.com

### Step 2: Install Handoff

1. Open your ZXP installer
2. Drag the `Handoff-v____.zxp` file into the installer window
3. Wait for the "Success" confirmation

### Step 3: Restart After Effects

Quit After Effects completely and reopen it. The extension loads on startup.

### Step 4: Open the panel

Go to **Window > Extensions > Handoff**. A small toolbar appears with two buttons and a status bar.

## How to Use

1. **Select one or more layers** in your comp
2. **Click "Handoff"** — this applies the dynamic parenting rig
3. In **Effect Controls**, assign parent layers to the P1-P5 slots and set their weights (0-1)
4. **Animate the weights** with keyframes to hand off between parents over time
5. The panel auto-updates — the status dot turns green and shows "Tracking"

## Tips

- **Undo:** Ctrl+Z / Cmd+Z requires **two presses** — the first undoes the auto-update, the second undoes your action. This is expected.
- **Remove the rig:** Select the layer and click the **X** button
- **Rescan:** If you open an old project and the panel shows "Idle", click the circular arrow button in the status bar to rescan

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Panel doesn't appear in Window > Extensions | Make sure you fully quit and reopened AE (not just closed the project) |
| Panel says "Disconnected" | Close and reopen the panel from Window > Extensions > Handoff |
| Rig isn't tracking after opening an old project | Click the rescan button (circular arrow in the status bar) |
