# Project Status Log: PetFinder — Future Native App Version (Ideas Backlog)
*Last Updated: 2026-07-13*

## 📍 Current State
PetFinder is being built **web-first**. A native app version is planned for later but has not been started — no code, no design work, nothing scheduled yet. This file exists to catch app-specific ideas as they come up during web development, so they aren't lost or forgotten by the time app work actually begins. Append new ideas here as they arise; don't let this file go stale.

## 🛠️ Immediate Next Steps
Not started — revisit when app development begins. Nothing below is actionable right now.

## 🧠 Technical Context & Details

### Idea #1 — Chat/messaging UX should differ by platform
The two platforms have different screen real estate, so the same feature should use a different navigation pattern on each:

- **Web version (current build):** WhatsApp *Web* style — split-pane, single screen. Conversation list and the active thread are shown together, side by side, in the same window.
- **Native app version (future, not started):** WhatsApp *mobile* style instead — two separate full screens. Chat list is shown first; tapping a conversation navigates to a dedicated thread screen; a back button returns to the list.

This is an intentional reversal between platforms, not an inconsistency — noted here specifically so it doesn't get "fixed" into matching the web version by mistake when app work starts.

## ⚠️ Risks & Things to Double-Check
- [ ] When app development begins, confirm whether the underlying data model (per-post conversation scoping, message schema) designed for the web version still holds, or needs adjustment for native navigation/state patterns.
- [ ] Watch for scope creep: don't start building app-specific code while still in the web-only phase.
