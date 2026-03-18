# HabitGlo — Desktop App Instruction Manual

> **Ambient reminders on your screen.**
> HabitGlo keeps your habits and reminders scrolling across your desktop all day — like a neon LED ticker sign — so you never forget what matters.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [The Dashboard](#the-dashboard)
3. [Adding Habits & Reminders](#adding-habits--reminders)
4. [Habit Packs](#habit-packs)
5. [Managing Your Habits](#managing-your-habits)
6. [The Desktop Overlay](#the-desktop-overlay)
7. [Overlay Controls](#overlay-controls)
8. [Overlay Style & Customization](#overlay-style--customization)
9. [Desktop Themes](#desktop-themes)
10. [Streak Tracking](#streak-tracking)
11. [Leaderboards](#leaderboards)
12. [Account & Billing](#account--billing)
13. [Keyboard & Mouse Reference](#keyboard--mouse-reference)
14. [Tips & Tricks](#tips--tricks)

---

## Getting Started

When you open HabitGlo for the first time, two windows appear:

1. **The Dashboard** — your main control panel where you add habits, change settings, and manage everything.
2. **The Overlay** — a slim, transparent strip that floats on top of your other apps, scrolling your habits like an LED marquee.

The overlay starts in **always-on-top** mode, meaning it stays visible above all your other windows.

---

## The Dashboard

The dashboard has two columns:

**Left column (main content):**
- Add habits and reminders
- View and manage your active habit cycle
- Browse and apply Habit Packs
- See today's completed habits
- Account panel (sign in, billing)

**Right column (sidebar):**
- App Overlay Settings (speed, spacing, desktop controls)
- Overlay Style (fonts, colors, glow, palettes)
- Desktop Theme (full UI theme selector)
- Leaderboards (personal and global streak rankings)
- Tips

---

## Adding Habits & Reminders

1. Type your habit or reminder into the text field (220 characters max per habit).
2. Press **Enter** to add a single habit, or click **Add All Habits** to add everything at once.
3. Click **+ Add Habit/Reminder** to add more text fields so you can type multiple habits before submitting them together.
4. To remove an extra text field, click the **×** button next to it, or press **Backspace** when the field is empty.

Your habits immediately appear in the **Active Cycle** list and start scrolling on the overlay.

---

## Habit Packs

Habit Packs are curated bundles of habits you can apply with one click. Available packs:

| Pack | Focus | Habits |
|------|-------|--------|
| **The Deep Flow Protocol** | Focus & deep work | 4 habits |
| **The Biohacker's Baseline** | Energy & metabolic health | 5 habits |
| **The Looksmaxxing Pack** | Posture & facial aesthetics | 5 habits |
| **The Stoic Resilience Pack** | Emotional regulation | 4 habits |
| **The Awareness & Freedom Pack** | BFRB awareness | 5 habits |

Clicking a pack **replaces** your current habits with the pack's habits. This lets you switch contexts quickly (e.g., switch to the Stoic pack during a stressful day).

---

## Managing Your Habits

Each habit card in the **Active Cycle** shows:

- **Drag handle** (grid icon on the left) — drag to reorder. Habits higher in the list appear more prominently in the overlay scroll.
- **Streak badge** — shows your current consecutive-day streak with a flame icon (e.g., "🔥 14").
- **Priority number** — shows the habit's position in the scroll order (e.g., #1, #2).
- **Log** button — mark the habit as done for today. Once logged, it shows "Done" and is grayed out until tomorrow.
- **Pause/Resume** button — temporarily hide a habit from the overlay without deleting it.
- **Delete** button — permanently remove the habit.
- **Color dot** — click to cycle through the three palette colors (primary, secondary, accent). This changes the color of that habit's text on the overlay.

**Delete All** removes every habit in one click.

---

## The Desktop Overlay

The overlay is the always-visible LED marquee strip that floats on your desktop.

### Moving the Overlay

**Hold Ctrl or Alt, then click and drag** the overlay to reposition it anywhere on your screen.

> Regular clicks on the overlay are ignored for dragging — the modifier key prevents accidental moves while you're working.

### Play / Pause

The large **Play/Pause button** in the dashboard header starts or stops the overlay scroll. When paused, the text freezes in place.

### Toggle Overlay Visibility

Click **Toggle overlay** in the settings panel to show or hide the overlay window entirely.

---

## Overlay Controls

These controls are found in **App Overlay Settings** on the dashboard:

### Scroll Speed
Adjusts how fast the text scrolls across the overlay (10–800 px/s). Lower values give a calm, ambient feel. Higher values make habits more attention-grabbing.

### Spacing / Frequency
Controls the gap between habit repetitions in the scroll (0–800 px). Higher spacing means more breathing room between each habit as it loops.

### Click-Through Mode
When **enabled**, the overlay becomes completely transparent to mouse input. You can click, type, and interact with apps directly through the overlay as if it isn't there. The overlay becomes purely visual.

When **disabled**, clicking on the overlay interacts with the overlay itself (and you can Ctrl/Alt+drag to move it).

### Always on Top
When **enabled** (default), the overlay stays above all other windows. When disabled, other windows can cover the overlay.

### Reserve Screen Space
When **enabled**, the overlay reserves its strip of screen real estate — just like the Windows taskbar. Other maximized windows won't overlap the overlay; they'll stop at the overlay's edge. This uses the Windows AppBar API.

### Snap to Top / Snap to Bottom
Instantly repositions the overlay to the top or bottom edge of your screen, centered horizontally. When combined with **Reserve Screen Space**, the overlay docks like a toolbar.

---

## Overlay Style & Customization

### LED Font
Choose from 4 retro LED-style fonts:
- **Dot Gothic** — classic dot-matrix look
- **Silkscreen** — pixel-perfect bitmap style
- **Press Start** — chunky arcade font
- **VT323** — retro terminal monospace

### Show Dot Separator
Toggle the dot (•) separator between habits on or off. When off, habits are separated by whitespace only.

### Glow / Bloom
Controls the intensity of the neon glow effect behind the scrolling text (0–100%). At 0% there's no glow; at 100% the text has a strong neon bloom.

### Text Glow Capacity
Controls the overall brightness/opacity of the scrolling text (20–100%).

### Color Palettes
Choose from 10 color palettes that determine the three text colors used on the overlay:

| Palette | Colors |
|---------|--------|
| Classic | Red, Amber, Green |
| Synthwave | Pink, Cyan, Yellow |
| Focus | Light Blue shades |
| Warm Amber | Orange/Amber shades |
| Forest | Green shades |
| Lavender | Purple shades |
| Minimal | Gray/Silver shades |
| Sunrise | Orange to Yellow |
| Ocean | Cyan/Teal shades |
| Night Owl | Indigo shades |

Each habit cycles through the palette's three colors. Click the color dot on a habit card to manually assign which palette color it uses.

---

## Desktop Themes

Desktop Themes change the entire look of both the dashboard and the overlay — backgrounds, borders, gradients, and accent colors. Select a theme from the grid in the settings panel. The overlay's background, shell, and LED panel update to match.

> **Tip:** You can still override the overlay's *text* colors by choosing a different palette in the Overlay Style section above. The Desktop Theme controls the UI chrome; the palette controls the scrolling text colors.

---

## Streak Tracking

Every time you click **Log** on a habit, HabitGlo records that you completed it today. If you log the same habit on consecutive days, your streak grows.

### Streak Badges
Streaks earn milestone badges that appear next to your streak count:

| Days | Badge | Meaning |
|------|-------|---------|
| 1 | 🟢 | First step |
| 3 | 🌱 | Spark |
| 7 | ✨ | 1 week |
| 10 | 🔟 | Double digits |
| 14 | 💪 | 2 weeks |
| 21 | 🧠 | Habit forming |
| 30 | ⭐ | 1 month |
| 60 | 🧭 | 2 months |
| 100 | 💯 | 100 days |
| 180 | 🔥 | Half-year |
| 365 | 🎉 | 1 year |
| 1000 | 🏆 | 1000 days |

(And many more milestones up to 100 years.)

### Completed Today
The **Completed Today** section at the bottom of the left column shows every habit you've logged today, along with the updated streak count.

---

## Leaderboards

Leaderboards track your highest streaks and let you compare with other HabitGlo users.

### My Top 5
Shows your personal top 5 habits ranked by current streak.

### Global Top 5
Shows the top 5 streaks across all HabitGlo users who have opted in.

### Sharing
Toggle **"Share my habits on global leaderboard"** to opt in or out of the global rankings. Your habit text and streak are visible to others when sharing is enabled.

Click **Refresh** to update the leaderboard data.

---

## Account & Billing

### Sign In
Three authentication methods:
- **Email + Password** — standard sign in or create a new account
- **Magic Link** — enter your email and receive a one-click login link (no password needed)

### Subscription Status
After signing in, the Account panel shows your current subscription status (Free, Active, Trialing, or Lifetime).

### Plans
- **Monthly ($4/mo)** — full access, cancel anytime
- **Lifetime ($29 one-time)** — pay once, use forever

### Billing Actions
- **Start Monthly / Buy Lifetime** — opens the checkout flow
- **Upgrade to Lifetime** — available if you're on a monthly plan
- **Manage Billing** — opens the billing portal to update payment, cancel, etc.
- **Refresh Billing Status** — re-checks your subscription after completing a payment
- **View Plan Details** — opens the pricing page on the website

---

## Keyboard & Mouse Reference

| Action | How |
|--------|-----|
| **Move the overlay** | Hold **Ctrl** or **Alt**, then click and drag |
| **Add a habit** | Type in the field, press **Enter** |
| **Remove an empty text field** | Press **Backspace** when the field is empty |
| **Cycle habit color** | Click the colored dot on a habit card |
| **Reorder habits** | Drag the grip handle (⠿) on the left of a habit card |

---

## Tips & Tricks

- **Use click-through mode when coding or presenting.** The overlay becomes invisible to your mouse — you can work normally while habits scroll in your peripheral vision.
- **Drag habits to reorder.** Habits higher in the list cycle more frequently in the marquee.
- **Use Synthwave palette + high glow for a neon effect.** Crank the glow slider to 100% and pick the Synthwave palette for peak retro aesthetics.
- **Reserve screen space for a permanent dock.** Enable Reserve Screen Space + Snap to Top/Bottom to create a permanent habit ticker that other apps won't cover — like a second taskbar.
- **Pause when you need focus.** Hit the Pause button to freeze the scroll. Your habits stay visible but static, which can be less distracting during deep work sessions.
- **Switch packs for context.** Apply a different Habit Pack when your focus changes — Deep Flow for coding, Biohacker for health breaks, Stoic for tough days.
