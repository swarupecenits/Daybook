# Daybook

A private, offline daybook for **notes, tasks and money** — one calm, paper-journal app for the work
day, the to-do list and the friends who still owe you for dinner.

Expo SDK 58 · React Native 0.88 · Expo Router · SQLite · runs in **Expo Go** (no native build needed to try it).

## What's inside

| Tab | What it does |
| --- | --- |
| **Today** | Big date and week strip, a timestamped work log, tasks due or overdue, a money pulse, recent notes, and **Share standup**: a Done / Next / Blockers summary ready to paste into chat. Tag a task `#blocked` or `#waiting` to list it under Blockers. |
| **Notes** | A masonry grid of paper-coloured notes with `#tags`, pin, archive and search. The editor has checklist, bullet, heading and quote shortcuts, a read mode with tappable checkboxes, and saves as you type. |
| **+** | Quick capture: one box that works out whether you typed a task, note, log, expense or money with a friend. |
| **Tasks** | Today · Upcoming · Anytime · Done. Plain-English dates, priorities, tags and repeats, subtasks, reminders, and swipe to complete or snooze. |
| **Money** | **Friends**: a ledger per person ("I gave" / "I got"), running balance, settle up, and WhatsApp/SMS reminders with your UPI link. **Spending**: expenses by month, categories, a monthly budget, charts, and bill splits that post to each friend's ledger. |

Also: global search, a 30-day trash, light/dark/system themes, 9 currencies (₹ by default, with
lakh/crore grouping), haptics, JSON backup and restore, and an app lock.

### Quick capture cheatsheet

| Type this | You get |
| --- | --- |
| `Call the bank tomorrow 10am !!` | Task due tomorrow at 10:00, medium priority |
| `Standup notes every weekday #work` | Task repeating on weekdays, tagged `work` |
| `Pay rent on 1st dec !high` | Task on 1 Dec, high priority |
| `Dentist in 3 days 5pm` · `Call mom tonight` | Task with a date and time |
| A few lines of text, or `note: …` | Note (a short first line becomes the title) |
| `log: Shipped the onboarding flow` · `spent 2h on the design review` | Work-log entry for today |
| `Lunch 250` · `spent 1.2k on groceries` · `uber 180 yesterday` | Expense with a guessed category |
| `Asha owes me 500 for dinner` · `lent 2k to Asha` · `got 300 from Rahul` | Entry on that friend's ledger |
| `Rahul 500 movie` | Money with a friend you already have, saved as money you gave. Tap ⇄ to flip it. |

- **Priority:** `!` low, `!!` medium, `!!!` high, or `p1` (high) to `p3` (low), or `!low` / `!med` / `!high` / `!urgent`.
- **Dates:** `today`, `tonight`, `tomorrow`, `friday` or `this friday` (the coming one), `next friday` (the Friday of
  next week), `this weekend`, `next week`, `in 3 days`, `12 dec`, …
- **Repeats:** `daily`, `weekdays`, `every monday`, `weekly`, `monthly`, `yearly`.
- **Prefixes** pick the kind: `task:` / `t:` task, `note:` / `n:` note, `log:` / `did:` / `done:` log, `spent:` / `paid:` expense.
- Recognised words show up as chips while you type, so you see the exact date before saving. Tap a chip to keep
  those words in the title instead.

## Run it on your phone (development)

You need Node.js 22.13+ or 24.3+ (any current LTS) and the **Expo Go** app from the App Store or Play Store.

```powershell
cd C:\Users\swarupchanda\Workspace\daybook
npm install
npx expo start
```

1. A QR code appears in the terminal.
2. **iPhone:** scan it with the Camera app. **Android:** scan it from Expo Go.
3. The phone and PC must be on the same Wi-Fi. If the phone can't connect (office network, VPN, or Windows
   Firewall), run `npx expo start --tunnel`, or allow Node.js on private networks when Windows asks.

Useful keys in the terminal: `r` reloads the app, `j` opens the debugger, `w` opens the web version, and
`Ctrl+C` stops the server. Code changes appear on the phone instantly.

Good to know when using Expo Go:

- **Your data lives inside Expo Go on that phone.** Deleting Expo Go deletes it. When you move to an
  installed build later, the data does not carry over automatically: use **Settings → Export a backup** in
  Expo Go, then **Import a backup** in the new app.
- **App lock:** Expo Go can't use Face ID, so iOS asks for your passcode instead. Face ID works in an installed build.
- **Reminders** are local notifications. They work in Expo Go, which may log a notice about *push*
  notifications that Daybook doesn't use.
- The home-screen icon and splash screen are Expo Go's. Daybook's own icon appears in an installed build.
- If Expo Go says the project is incompatible, update Expo Go. This project targets SDK 58.

## Checks

```powershell
npm run check        # typecheck + lint + unit tests
npm run typecheck    # tsc --noEmit
npm run lint         # expo lint (ESLint 9, React Compiler rules)
npm test             # Jest
npx expo-doctor      # Expo dependency and config health
```

## Privacy and security

- **Everything stays on the phone**, in a local SQLite database. No account, no Daybook server, no analytics or
  trackers, and the app makes no network requests.
- **Your phone's own backup still covers it.** On Android, if phone backup is on (it usually is), Google's
  automatic backup includes Daybook's data. It's end-to-end encrypted with your screen lock on Android 9 and
  later, and comes back when you reinstall Daybook on a new or reset phone. If a restored app lock finds no
  screen lock on that phone, it switches itself off instead of locking you out. On iPhone, Daybook is part of
  your normal iCloud or computer backup.
- **Minimal Android permissions:** the build blocks the storage, photo-library and draw-over-other-apps
  permissions that Expo's template and libraries would otherwise add.
- **App lock** with Face ID, Touch ID, fingerprint or passcode. Re-locks immediately, after 1 minute or after
  5 minutes away. It can only be turned on after a successful unlock, so you can't lock yourself out.
- **Privacy screen** (on by default): iOS hides content in the app switcher. Android also blocks screenshots
  and recents previews.
- Hardening: parameterised SQL everywhere, length limits on every field, and amounts stored as whole paise or
  cents (capped at ₹100 crore). The calculator keypad uses its own parser rather than `eval`. Only `http(s)://`
  links in notes are tappable, and they open in your browser.
- **Backups are plain JSON**, so store exported files somewhere private. On import, every row is validated:
  unknown fields are dropped, invalid rows skipped and counted, and the file is capped at 25 MB. Importing
  merges by ID, and the newer edit wins.
- Exported backups never include app lock or privacy settings.

## Project layout

```
src/
  app/          Expo Router screens: (tabs)/ for Today, Notes, Tasks, Money; detail screens; capture, search, settings
  components/   UI kit: text, buttons, sheets, chips, charts, task rows, note cards, icons
  db/           SQLite adapter, schema and migrations (PRAGMA user_version), repositories
  hooks/        App lock and privacy screen
  lib/          Pure logic, unit-tested: parsers, money, dates, splits, search, backup validation
  stores/       Zustand stores. Writes go to the database first, then to state.
  test/         Jest helpers (in-memory SQLite through node:sqlite)
  theme/        Palette (light and dark), type scale, spacing
scripts/
  generate-icons.mjs   Copies just the Phosphor icons the app uses into src/components/icon-glyphs.ts
```

To add an icon, list it in `scripts/generate-icons.mjs` and run `npm run icons`.

## Publishing (when you're happy with it)

All commands run from the project folder and need a free Expo account. Sign in and link the project once:

```powershell
npx eas-cli@latest login
npx eas-cli@latest init
```

This copy is already linked to the Expo project `@swarupcsenits/daybook` (`owner` and `extra.eas.projectId` in
`app.json`), so you don't need `init` again. Run `login` only on a new computer or after signing out.

EAS uploads the project folder, including uncommitted changes, and skips anything listed in `.gitignore`.
Commit before each build so every build matches a commit you can return to.

EAS created the Android signing key on the first build and keeps it on Expo's servers. Every future APK must be
signed with that same key or it won't install over the old one, so keep it on EAS. To download a backup, run
`npx eas-cli@latest credentials -p android`.

**Android (free):** builds an installable APK and gives you a download link and QR code.

```powershell
npx eas-cli@latest build -p android --profile preview
```

The APK contains only ARM code, 64-bit and 32-bit, which covers practically every Android phone. It leaves out
the x86 code that only emulators use, and the native code is stored compressed so the download stays small. To
run it on an x86 emulator, add `"x86_64"` to `buildArchs` under `expo-build-properties` in `app.json` first.

**iPhone:** installing outside Expo Go needs a paid **Apple Developer Program** membership (US$99/year).

- **TestFlight (simplest):** `npx testflight` builds the app, signs it and uploads it. Then install it
  through the TestFlight app.
- **Direct install:** register your iPhone with `npx eas-cli@latest device:create`, then run
  `npx eas-cli@latest build -p ios --profile preview`.
- **Free option:** keep using Expo Go with `npx expo start`. Your PC has to be running the dev server.

**Updates without rebuilding:** set this up *before* the build you install. Run `npx expo install expo-updates`
and `npx eas-cli@latest update:configure`, then build. After that,
`npx eas-cli@latest update --channel preview --message "…"` sends JavaScript changes straight to the
installed app. The app then checks Expo's update server when it opens, which is its only network traffic.

**App stores:** use `npx eas-cli@latest build --profile production`, then `npx eas-cli@latest submit`. Google
Play has a one-time US$25 developer fee, and the App Store needs the Apple Developer Program.

## Notes

- `package-lock.json` points at the public npm registry. On a PC with a company registry in `.npmrc`,
  npm fetches the same packages through that registry automatically.
- `npx expo-doctor` may report a few patch updates (for example `expo 58.0.26`). Run `npx expo install --fix`
  once your registry has them.
- During `npm install`, npm prints deprecation notices for packages like `glob`, `inflight` and
  `whatwg-encoding`. These come from Jest and Babel tooling and are not part of the app.
- `npm audit` reports two moderate advisories, in `minimatch` (GHSA-g3hv-75wg-m249) and `glob`
  (GHSA-3g3m-2fjr-6pw4). Both sit inside Jest and Expo CLI tooling on your PC and never reach the app. The
  fixes exist only in new major versions that Jest and Expo haven't adopted yet, so leave them until
  `npx expo install --fix` picks them up.

## Credits

Icons from [Phosphor](https://phosphoricons.com) (MIT). Fonts are [Fraunces](https://fonts.google.com/specimen/Fraunces),
[Figtree](https://fonts.google.com/specimen/Figtree) and [IBM Plex Mono](https://fonts.google.com/specimen/IBM+Plex+Mono)
(SIL Open Font License), via `@expo-google-fonts`.
