# LevelUp

An iOS app that gates your (or your kid's) game/social apps behind chores and a daily
fitness score. Finish chores and hit fitness targets → earn points → redeem points for
game time → apps unlock for exactly that long, then re-lock automatically.

## How it fits together

| Feature | Framework | Where |
|---|---|---|
| Screen Time connection & app locking | FamilyControls, DeviceActivity, ManagedSettings | `App/Services/ScreenTimeManager.swift`, `ShieldController.swift`, the three extension targets |
| Fitness scorer + corrections | HealthKit | `App/Services/HealthKitManager.swift`, `FitnessScorer.swift` |
| Chore / daily task tracker | SwiftData | `App/Models/Chore.swift`, `App/Views/ChoreListView.swift` |
| Game time economy | Custom (points ledger) | `App/Services/GameTimeBank.swift`, `App/Views/GameTimeView.swift` |
| AI coach chat | Claude API | `App/Services/AIClient.swift`, `App/Views/CoachChatView.swift` |
| AI chore suggestions | Claude API | `App/Services/ChoreSuggestionService.swift`, `App/Views/SuggestChoresView.swift` |
| AI weekly fitness insights | Claude API | `App/Services/FitnessInsightService.swift` (card in `FitnessView`) |
| AI game-time tip | Claude API | `App/Services/CoachTipService.swift`, `App/Views/Components/CoachTipCard.swift` |
| Outfit maker & scorer | Claude API (vision) | `App/Services/OutfitScorer.swift`, `App/Views/OutfitView.swift` |

**The enforcement loop:** `ScreenTimeSetupView` lets you pick apps/categories with
`FamilyActivityPicker`. `ShieldController` shields them by default via a named
`ManagedSettingsStore`. Redeeming game time in `GameTimeView` removes the shield and
writes an expiry timestamp to a shared App Group `UserDefaults` suite. A
`DeviceActivityMonitor` extension (a separate process the system wakes up on schedule,
independent of whether the app is even running) re-applies the shield the moment that
window elapses, and again every midnight. Points come from `PointsTransaction` rows
written whenever a chore is completed or a day's `FitnessSnapshot` is scored — the
balance is just the sum, so it can't drift out of sync.

## AI features

Every AI feature (Coach chat, chore suggestions, weekly fitness insight, the game-time
tip, and the outfit scorer/maker) calls the Anthropic Messages API **directly from the
device** — there is no backend server. To use any of it:

1. Get an API key at [console.anthropic.com](https://console.anthropic.com).
2. Open the **Settings** tab in the app and paste it in.

The key is stored in the iOS Keychain (`App/Services/KeychainHelper.swift`), never in
`UserDefaults` or anywhere synced/backed-up in plaintext, and is only ever sent in the
`x-api-key` header of requests to `api.anthropic.com` (see `App/Services/AIClient.swift`).
Every feature is written to fail gracefully with a "add your API key in Settings" prompt
if it's missing.

**Cost/privacy note:** since this is bring-your-own-key with no backend, usage is billed
to your own Anthropic account, and whatever context each feature sends (today's chore
titles, fitness numbers, chat messages, wardrobe/outfit photos) goes to Anthropic's API
like any other Claude API call. Nothing is sent anywhere else. The outfit scorer/maker
sends photos as images to the API to score them — don't feed it anything you wouldn't
want processed by a third-party API call.

You can pick between Sonnet (default), Opus, or Haiku per your speed/cost/quality
preference in Settings — see `AIModel` in `SettingsStore.swift`.

## Requirements

- macOS with **Xcode 15+**
- An iPhone running iOS 17+ (the Simulator does not support FamilyControls/Screen Time —
  you must test on a real device)
- An Apple ID signed into Xcode (a free personal-team account is enough for local
  development; Family Controls does **not** require Apple's special distribution
  entitlement approval for local/development use — that approval is only needed if you
  ever submit to the App Store)
- [XcodeGen](https://github.com/yonaskolb/XcodeGen) — `brew install xcodegen`

## Setup

```bash
cd LevelUp
xcodegen generate       # produces LevelUp.xcodeproj from project.yml
open LevelUp.xcodeproj
```

In Xcode:

1. Select the `LevelUp` project → each target (`LevelUp`, `DeviceActivityMonitorExtension`,
   `ShieldConfigurationExtension`, `ShieldActionExtension`) → **Signing & Capabilities** →
   set your Team. (Or set `DEVELOPMENT_TEAM` in `project.yml` under `settings.base` and
   re-run `xcodegen generate`.)
2. Change the bundle ID prefix from `com.example.levelup` to something under your own
   Team — edit `bundleIdPrefix` in `project.yml` (and the App Group id
   `group.com.example.levelup` in `Shared/AppGroupConstants.swift` + `project.yml`'s
   `com.apple.security.application-groups` entries, and the `.entitlements`), then
   re-run `xcodegen generate`. All four targets and the App Group must share the same
   prefix/team for the App Group entitlement to be valid.
3. In **Signing & Capabilities**, make sure each target actually has an **App Groups**
   capability pointing at `group.<your prefix>.levelup`, and the main app + monitor +
   shield-config extensions have **Family Controls**. Xcode usually adds these
   automatically from the entitlements file XcodeGen generates, but double-check.
4. Build and run on your device. On first launch you'll be asked for HealthKit and
   Screen Time (Family Controls) permission.

## Known limitations / things to double-check against current Apple docs

These frameworks (FamilyControls/DeviceActivity/ManagedSettings) are relatively young
and Apple revises them across iOS versions. I wrote this against the documented iOS 16/17
shape of the APIs, but since I can't compile/run this in the environment I built it in
(no macOS toolchain available), please treat the first build as a check, not a given:

- **`DeviceActivitySchedule` for redemption windows** (`ShieldController.scheduleReshield`)
  schedules a same-day, non-repeating interval ending at the unlock expiry time. If a
  redemption is started very close to midnight such that the expiry crosses into the next
  day, the hour/minute-only `DateComponents` schedule can behave oddly — as a backstop,
  `GameTimeBank.refreshFromSharedState()` also checks and clears an expired unlock
  whenever the app becomes active, so worst case is the shield re-applies a little late
  rather than never.
- **Individual vs. family enrollment**: `requestAuthorization(for: .individual)` is for
  a user managing their own device (the "self-control" case, like a teen/adult managing
  their own game time). If you want a *parent's phone* controlling a *child's device*,
  that's the `.child` / Family Sharing flow instead, which is a materially different setup
  (parent's app talks to the child's enrolled device, not the local device) — not what's
  wired up here.
- **Simulator**: FamilyControls APIs throw/no-op in the Simulator. Always test on a real
  device.
- App icon: `Assets.xcassets/AppIcon.appiconset` is an empty slot — drop in a 1024x1024
  icon before archiving for TestFlight/App Store.
- **AI JSON parsing**: features that need structured output (chore suggestions, outfit
  scoring/combinations) ask the model to respond with JSON-only and parse it by slicing
  from the first `{`/`[` to the last matching `}`/`]` (see e.g. `ChoreSuggestionService.parse`,
  `OutfitScorer.parse`). This is a pragmatic approach, not a strict schema — if a model
  response wraps JSON in prose despite instructions, parsing throws and the UI surfaces
  the error rather than crashing. If this proves flaky in practice, switch those calls to
  Claude's structured output / tool-use mode instead of prompt-only JSON.
- **Outfit Maker image limit**: `OutfitScorer.suggestCombination` caps at the first 12
  wardrobe items per request (all sent as images in one call) to keep requests reasonably
  sized — trim your catalog or add pagination if you outgrow that.

## Tuning the economy

- `GameTimeBank.minutesPerPoint` — how many minutes one point buys (default 1:1).
- `GameTimeBank.maxFitnessBonusMinutes` — bonus minutes-worth of points awarded for a
  perfect (100) fitness day, scaled linearly below that.
- `FitnessScorer` — per-component targets/weights (steps, exercise, active energy, stand
  time, sleep). Defaults are generic wellness targets, not medical guidance.
- Chore points are set per-chore when you create them in the Chores tab.
