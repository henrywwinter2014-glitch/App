# LevelUp

An iOS app that gates your (or your kid's) game/social apps behind chores and a daily
fitness score. Finish chores and hit fitness targets → earn points → redeem points for
game time → apps unlock for exactly that long, then re-lock automatically. Includes an
outfit checker that scores a photo of your outfit using a Core ML model that runs
entirely on-device.

**No AI APIs, no accounts, no ongoing cost.** Nothing in this app calls out to any
network service — Screen Time, HealthKit, and the outfit checker are all local to the
device.

## How it fits together

| Feature | Framework | Where |
|---|---|---|
| Screen Time connection & app locking | FamilyControls, DeviceActivity, ManagedSettings | `App/Services/ScreenTimeManager.swift`, `ShieldController.swift`, the three extension targets |
| Fitness scorer + corrections | HealthKit | `App/Services/HealthKitManager.swift`, `FitnessScorer.swift` |
| Chore / daily task tracker | SwiftData | `App/Models/Chore.swift`, `App/Views/ChoreListView.swift` |
| Game time economy | Custom (points ledger) | `App/Services/GameTimeBank.swift`, `App/Views/GameTimeView.swift` |
| Outfit checker | Core ML + Vision (on-device) | `App/Services/OutfitScorer.swift`, `App/Views/OutfitView.swift` |

**The enforcement loop:** `ScreenTimeSetupView` lets you pick apps/categories with
`FamilyActivityPicker`. `ShieldController` shields them by default via a named
`ManagedSettingsStore`. Redeeming game time in `GameTimeView` removes the shield and
writes an expiry timestamp to a shared App Group `UserDefaults` suite. A
`DeviceActivityMonitor` extension (a separate process the system wakes up on schedule,
independent of whether the app is even running) re-applies the shield the moment that
window elapses, and again every midnight. Points come from `PointsTransaction` rows
written whenever a chore is completed or a day's `FitnessSnapshot` is scored — the
balance is just the sum, so it can't drift out of sync.

## Training the outfit checker

The **Outfits** tab's "Check Outfit" screen scores a photo of an outfit 0-100 using a
Core ML model that runs entirely on-device — no network call, no API key, nothing to
pay for. There's no pretrained model shipped here, because "is this a good outfit" isn't
a standard task with an off-the-shelf model the way "identify a cat" is, and it should
reflect *your* taste anyway. You train it yourself, for free, with **Create ML**
(bundled with Xcode — no code, no Python, no external tools):

1. **Gather photos.** Take 100+ photos of full outfits (mirror selfies work fine — more
   photos and more variety in lighting/background make for a better model, but even a
   few dozen is enough to experiment with). Put them all in one folder.
2. **Score them yourself.** For each photo, decide a score from 0-100 reflecting how
   good you think that outfit is. Be consistent — the model can only learn the pattern
   you actually label.
3. **Open Create ML.** In Xcode: **Xcode → Open Developer Tool → Create ML** (or launch
   the Create ML app directly from Spotlight). Create a new project, choose the
   **Image Regressor** template.
4. **Add your training data.** Create ML's UI lets you point it at your image folder and
   pick (or import) the numeric score for each image — the exact import flow varies
   slightly by Xcode version, so follow Create ML's own prompts; the key idea is each
   image needs a matching numeric label. Create ML automatically splits off a validation
   set and trains using transfer learning (fast, and works with a relatively small
   dataset since it's fine-tuning an existing vision model, not training from scratch).
5. **Train, then export.** Once training finishes, export the model as `OutfitScorer.mlmodel`.
6. **Add it to Xcode.** Drag `OutfitScorer.mlmodel` into the `LevelUp/App/Resources/`
   folder in Finder, then in Xcode drag it into the project navigator under the `App`
   group and make sure it's checked for the **LevelUp** target (the main app target only
   — not the extensions). Xcode compiles it into the app bundle automatically.
7. Re-run the app. The "no trained model installed" banner on the Check Outfit screen
   disappears once the model loads successfully.

`OutfitScorer.swift` expects a single image input and a single scalar 0...1 output
(exactly what an Image Regressor produces) — if you use a different Create ML template
or a custom-trained model with a different output shape, adjust
`OutfitScorer.extractScore(from:)` to match. You can retrain and re-export any time your
taste changes or you have more data — just replace the `.mlmodel` file and rebuild.

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
   Screen Time (Family Controls) permission, and (only if you take an outfit photo
   in-app) Camera permission.
5. Train and add `OutfitScorer.mlmodel` per the section above whenever you want the
   outfit checker to actually score things — the app works fine without it, that one
   screen just shows a "no trained model installed" banner instead of scoring.

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
- **Outfit model output shape**: `OutfitScorer.extractScore(from:)` handles Double,
  Int64, and single-element MLMultiArray outputs, which covers what Create ML's Image
  Regressor produces. I couldn't test this against a real trained model in the
  environment I built this in — if scoring throws an "unexpected model output" error
  once you've added your `.mlmodel`, inspect the model's actual output type in Xcode's
  model preview and adjust that function.

## Tuning the economy

- `GameTimeBank.minutesPerPoint` — how many minutes one point buys (default 1:1).
- `GameTimeBank.maxFitnessBonusMinutes` — bonus minutes-worth of points awarded for a
  perfect (100) fitness day, scaled linearly below that.
- `FitnessScorer` — per-component targets/weights (steps, exercise, active energy, stand
  time, sleep). Defaults are generic wellness targets, not medical guidance.
- Chore points are set per-chore when you create them in the Chores tab.
