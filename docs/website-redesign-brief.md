# Overnight brief: redesign the HabitGlo website

Deadline: 09:00 (UTC+9). Worktree: `C:\Saas\HabitGlo-web`. Branch: `website/redesign` (already checked out).
Only edit website files: `landing.html`, `public/pricing.html`, `public/purchase.html`, `public/checkout/*.html`, `public/download/*`, `public/legal/*.html`, new files under `public/` (css, js, images, media), and `vercel.json` / `vite.config.ts` only if needed for the site to build. Do not touch `src/` or `src-tauri/` (another agent is changing the desktop app on a different branch).

## The product

HabitGlo is a Windows desktop app that puts a glowing LED dot-matrix strip at the top or bottom of your screen. It scrolls your tasks, health reminders and affirmations all day so you never drift or forget. $4/month or a lifetime plan (keep the exact prices and plan details already on the site). macOS has a waitlist.

## Art direction: no AI slop

Retire the current look (pink/blue/green gradients, glow everywhere, bento grid of icons, emoji-ish badges). It reads as a generic AI-generated SaaS page.

References the owner likes (screenshots attached to the agent): an editorial accounting site with a warm paper background, a big serif headline with one italic word, hand-drawn sketch illustrations and red pen annotations; a cinematic dark site with a single hero object, gold accent and a live data card; a tactile site with soft clay-like cards and characters. What they share: one strong idea, real typography, restraint, a hero object that IS the product, and small crafted details. Not a template.

Concept for HabitGlo, "After hours":
- Near-black warm background (not pure #000), warm off-white text, and the LED colors as the only saturated color: amber `#FFB000` primary, with LED red `#FF3B30` and LED green `#5BFF6B` used sparingly, only where something is "lit".
- Editorial serif display type (e.g. Instrument Serif or Fraunces, self-hosted or Google Fonts with `display=swap`) with an italic word in headlines, paired with a clean grotesk (e.g. Inter / Geist) for body and a pixel or mono face only inside the LED.
- The hero object is a realistic LED dot-matrix sign, rendered in code (canvas or CSS grid of dots with lit/unlit states, slight bloom, dot spacing visible), scrolling the real reminder messages. It should look like hardware, not a gradient text marquee.
- Small crafted details: handwritten-style annotations pointing at things ("this is your to-do list now"), numbered chapter labels, subtle grain, careful spacing, motion that eases (respect `prefers-reduced-motion`).

Keep existing copy that was already finalized:
- Hero: "Your goals, scrolling in front of you. All day." Sub: "A desktop LED sign that scrolls your tasks, health reminders, and daily goals across your screen, so you never drift, never forget, and always know what to do next."
- Hero LED messages: STOP OVERTHINKING. START DOING. / DONE IS BETTER THAN PERFECT / EVERY MINUTE COUNTS / DRINK WATER / SIT UP STRAIGHT / BLINK / FOLLOW UP WITH LEADS TODAY / REVIEW YOUR NUMBERS / ONE CONTENT RECORDING BEFORE LUNCH
- The three testimonials (ADHD & Focus, Health, Entrepreneur) with their highlighted phrases, the use-case list, pricing, FAQ (including the macOS item), and the macOS waitlist form.
You may tighten other copy, but no new claims or numbers that aren't already on the site.

## Sections (suggested, adjust if better)

1. Nav: wordmark, 3 links, one CTA.
2. Hero: headline, sub, primary CTA (Get HabitGlo) + secondary (Watch the demo), and the LED sign.
3. Demo: a built-in "film" of the product, made in code: a stylized Windows desktop with app windows; a cursor opens HabitGlo, types a reminder, presses Enter, and it appears on the LED strip docked at the top of the screen; windows resize to make room; time-of-day changes and the reminders change. Loops, has play/pause, chapter captions, and pauses when off-screen. Also support a real recording later: if `public/media/demo.mp4` exists, a "Watch the real recording" option plays it (with a poster image). Write in the log how the owner can drop a recording in.
4. Problem: "Your to-do list is in a drawer" type section, with one illustration (sticky notes chaos vs one calm LED line).
5. How it works: 3 numbered steps.
6. Who it's for: ADHD & focus / Health / Business, tied to the testimonials.
7. Pricing.
8. FAQ.
9. Final CTA + footer.

Illustrations: if you have an image generation tool, generate 2 to 4 images in one consistent style (pencil sketch on warm paper, or dark photographic desk scenes lit by an amber LED) and save them under `public/media/`. Keep each image under about 400 KB (resize/compress if you can). If not available, use code-drawn SVG.

Apply the same visual system to pricing, purchase, checkout, download and legal pages so the site feels like one product.

## Hard requirements

- Do not break: Paddle checkout scripts and their element IDs, the Supabase waitlist form submission, download links/config in `public/download/config.js`, Vercel routes in `vercel.json`, meta/SEO tags, favicon.
- Production quality CSS: replace the Tailwind Play CDN (`cdn.tailwindcss.com`) with a real stylesheet (shared file such as `public/site.css`). No runtime CSS generation.
- Fast: no layout shift, lazy-load below-the-fold images and the demo, fonts with `font-display: swap`, LED animation on canvas or transforms only, nothing animating when off-screen. Target Lighthouse performance 90+ on desktop.
- Responsive: looks intentional at 375, 768, 1280 and 1920 px widths. The LED sign and demo must work on mobile.
- Accessible: semantic headings, focus states, color contrast AA, alt text, keyboard-operable demo controls, `prefers-reduced-motion` support.
- Check your work visually: serve the site locally (e.g. `npx vite --port 5180` from the worktree, open `/landing.html` and the other pages) and take screenshots at desktop and mobile widths with the browser tools. Critique them against the references above and iterate at least twice. `npm run build` must still pass.

## Process

- Commit after each finished section or page (`git commit` on `website/redesign`) and push (`git push -u origin website/redesign`).
- Never ask questions; make the decision and write it in `docs/website-redesign-log.md`.
- Finish with `docs/website-redesign-log.md` containing: what changed, screenshots paths, how to add a real demo video, and anything the owner must check (Paddle sandbox checkout, waitlist form).
