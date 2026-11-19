# Productivity Log

Log what you're doing; the time and date are stamped automatically. The app scores each day,
exports a day to your calendar (.ics), and has an Analysis page that turns your logs into a
dithered mountain range of your focus hours. Pro (key-locked) adds editing times/dates,
backfilling, and a comparison with Elon Musk, Steve Jobs, Tim Cook and Jeff Bezos.

Built with Next.js, TypeScript, Tailwind CSS and the shadcn project structure.

## Run it on your computer

You need Node.js 20 or newer (https://nodejs.org).

```bash
npm install
npm run dev
```

Open http://localhost:3000. The Analysis page is at http://localhost:3000/analysis.

## Host it free on Vercel

1. Create a free GitHub account and a new empty repository.
2. In this folder, run:
   ```bash
   git add -A
   git commit -m "Productivity Log"
   git branch -M main
   git remote add origin https://github.com/YOUR-NAME/YOUR-REPO.git
   git push -u origin main
   ```
3. Go to https://vercel.com, sign in with GitHub, click **Add New → Project**, pick the repo,
   and click **Deploy**. No settings to change. You get a free `your-project.vercel.app` URL,
   and every `git push` redeploys.

The site is fully static, so Netlify or Cloudflare Pages work too.

## Where the data lives

Entries are saved in the visitor's own browser (localStorage). Each person who opens your site
gets their own private log; nothing is sent to a server. Clearing browser data or switching
devices starts a fresh log.

## Project layout

```
app/page.tsx                         tracker
app/analysis/page.tsx                analysis
components/ui/backgrounds-glyph.tsx  glyph background (as pasted)
components/ui/ridgeline-dither-footer.tsx  ridgeline footer (as pasted; its helpers drive the range)
components/ui/button.tsx             button primitive
components/focus-range.tsx           the data-driven dithered range
components/tracker.tsx               tracker UI
components/analysis-view.tsx         analysis UI
lib/                                 scoring, analysis, .ics export, storage
```
