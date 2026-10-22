# IBM BAW Companion

<p align="center">
  <img src="baw-companion.png" alt="IBM BAW Companion logo" width="256" />
</p>

<p align="center">
  <strong>IBM BAW Companion</strong>
  <br/>Enhance your IBM BPM experience with automation and smarter navigation
  <br/><br/>
  <a href="https://github.com/EduMelo/ibm-baw-companion/actions">
    <img src="https://github.com/EduMelo/ibm-baw-companion/actions/workflows/ci.yml/badge.svg" alt="Build status" />
  </a>
</p>

A Chrome extension that enhances the IBM BAW experience with smarter navigation and productivity tools tailored for developers and analysts.

---

## Current Features

- Automatically reopens the **Process Center** when accessing the **Process Designer**
- Opens the Process Center in the background, to the left of the current tab
- Behavior can be toggled via a checkbox on the extension’s settings page
- Allows configuration of the **target hostname** for login redirects
- On **Process Inspector** pages (dev/test/run), adds a reflexive "recurrence" icon next to
  each task in the Tasks pane, letting you replay that step via a `moveToken` REST
  orchestration (looks up the task's node in the instance's `executionTree` and moves a
  token back to its `flowObjectId`)
- Adds a command row right below the instance summary with a launch icon that opens the
  same instance in the **Process Portal** (`launchInstanceUI`)
- Allows configuring the **Basic Authentication** credentials used to call the BPM REST API

---

## Planned Features

- Sort input/output service attributes alphabetically
- Copy content from disabled or read-only fields in the UI
- Modernize the default code editors with better visuals and features
- Improve and extend debugging tools to streamline troubleshooting and development within BAW
- Add automation tools and power-user enhancements for daily BAW tasks
- Improve navigation and visibility between related artifacts

---

## Getting Started

```bash
pnpm install
pnpm dev
```

1. Go to `chrome://extensions`
2. Enable **Developer Mode**
3. Click **Load unpacked** and select the `dist/` folder

---

## Production Build

```bash
pnpm build
```

---

## Required Permissions

- `storage` – to save user preferences
- `tabs` – to open and manage browser tabs
- `webNavigation` – to inject behavior during login redirect
- `scripting` – to add custom DOM logic dynamically

---

## License

MIT © edumelo
