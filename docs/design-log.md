# Desktop design log

## Morning note

The buttons are a hairline with a cut on the top-left and bottom-right. Pause is an amber line and amber type. Hide LED and Add are the same shape in warm gray. Nothing is a filled bar, and nothing is a soft pill.

Rejected: the old rounded amber buttons, the 2px squares, and a filled amber button with the same cut (it still looked like a candy button).

Glance at: the main window (Pause, Add, the reminder list) and Settings (Medium and Classic LED should be the amber cut). The list is lines, not cards. The on/off switch is still round.

70 unit tests passed. Settings was opened in the browser preview and speed was switched to Fast, then back to Medium.

The real-window smoke script was not started. HabitGlo was already open (debug build, PID 34836), and the script refuses to launch a second copy so it cannot touch that session. Quit the tray app and run `scripts/smoke-desktop.ps1` to see the new buttons on the real window.

## References (before drawing)

Checked 24 Oct 2026, before any new button was drawn.

- **TrustMRR / [AI Designer](https://aidesigner.ai).** The products that sell there sell on looking custom. AI Designer's own line is "designs that don't look AI-generated." Their pages still use a normal filled call-to-action. The useful part is the warning, not their button: a uniform radius plus a filled bar on every control is what reads as generated.
- **[Raycast](https://www.raycast.com).** A desktop tool. One idea per screen, keyboard first, almost no cards. The control is quiet. The product is the thing you operate, not a stack of equal boxes.
- **[Linear](https://linear.app).** Tight type, one accent, small controls. Hierarchy comes from weight and a single mark, not from a large candy button.

Rejected from those sites: copying a pill, and copying a flat 2px rectangle. Both were already tried on HabitGlo and turned down.

## Shape

A cut corner (chamfer) on two opposite corners: top-left and bottom-right. Cutting all four corners still reads as a rounded square from a distance. Cutting two makes a direction, which is how game HUDs mark a control.

Three studies were compared on one page (then removed).

| Study | Look | Decision |
| --- | --- | --- |
| A. Solid | Filled amber bar with a cut corner | Rejected. The cut does not save it. It is still the candy button. |
| B. Hairline | 1px line following the cut. Primary is an amber line and amber type. | Locked. |
| C. Corner tick | No box, only a small amber mark | Too quiet for Pause, and the label wraps. Kept only for low-emphasis text actions. |

Locked rule: no filled button. Primary is an amber hairline with amber type. Secondary is the same cut with a warm gray line and off-white type. The cut is top-left and bottom-right only, 10px. A switch stays round.
