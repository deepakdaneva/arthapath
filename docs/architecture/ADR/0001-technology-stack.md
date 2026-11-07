# ADR-0001: Technology stack

- **Status:** Accepted
- **Date:** 2026-11-07

## Context

One codebase is needed for web, Android, and later iOS. It must be free,
actively maintained, and work with the Firebase client SDK.

## Decision

- Ionic Framework 9 + Angular 22 (latest stable at time of writing;
  Ionic 9 supports Angular 18–22), standalone components, TypeScript.
- Capacitor 8 for native shells (Android now, iOS later). One codebase:
  the Android app is the same Ionic/Angular web build in a WebView (hybrid).
- Android toolchain: Gradle 9.9, Android Gradle Plugin 9.5, JDK 25 for the
  Gradle daemon. Java language level 21 (Capacitor 8 requirement; Android
  runtime compatibility). Revisit with Capacitor 9.
- State: Angular signals in feature stores. No NgRx.
- Firebase: the modular `firebase` JS SDK used directly, without
  `@angular/fire`. Its latest release targets Angular 21; a thin wrapper of
  our own avoids the version lag and an extra dependency.
- Charts: Apache ECharts via tree-shaken `echarts/core` imports,
  lazy-loaded on the dashboard route. Covers pie, donut, line, and bar
  charts, and click events for drill-down.
- Tests: Angular's default unit-test runner, Playwright for end-to-end,
  `@firebase/rules-unit-testing` for security rules.

## Alternatives considered

- Chart.js: smaller, but drill-down and financial-trend features need more
  custom code. ECharts with tree-shaking is acceptable when lazy-loaded.
- NgRx: unneeded ceremony at this app size; signals are enough.
- React Native / Flutter: Ionic + Angular was requested.

## Consequences

Exact versions are pinned when the app is scaffolded in Phase 3 and
re-verified then.
