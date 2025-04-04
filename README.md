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

## 🔧 Current Features

- 🔁 Automatically reopens the **Process Center** when accessing the **Process Designer**
- 🧠 Opens the Process Center in the background, to the left of the current tab
- ✅ Behavior can be toggled via a checkbox on the extension’s settings page
- 🌐 Allows configuration of the **target hostname** for login redirects

---

## 🛠️ Planned Features

This extension is built to evolve. Future ideas include:

- 🧹 Sort input/output service attributes alphabetically
- 📋 Copy content from disabled or read-only fields in the UI
- 🧪 Modernize the default code editors with better visuals and features
- 🐞 Improve and extend debugging tools to streamline troubleshooting and development within BAW
- ⚙️ Add automation tools and power-user enhancements for daily BAW tasks
- 🔍 Improve navigation and visibility between related artifacts

---

## 📁 Project Structure

```
├── public/
│   ├── chrome_manifest.json      # Extension manifest
│   └── options.html              # Settings page UI
├── src/
│   ├── background/
│   │   └── chrome/background.ts  # Background logic for tab creation
│   ├── lib/
│   │   ├── app.ts                # Content script entry point
│   │   └── utils.ts              # Core behavior
│   └── options.ts                # Logic for settings page
├── webpack/
│   ├── webpack.common.js
│   ├── webpack.dev.js
│   └── webpack.prod.js
```

---

## 🚀 Getting Started (Development)

```bash
pnpm install
pnpm app:chrome-dev
```

1. Go to `chrome://extensions`
2. Enable **Developer Mode**
3. Click **“Load unpacked”** and select the `dist/` folder

---

## 📦 Production Build

```bash
pnpm build
```

---

## 🔐 Required Permissions

- `"storage"` – to save user preferences
- `"tabs"` – to open and manage browser tabs
- `"webNavigation"` – to inject behavior during login redirect
- `"scripting"` – to add custom DOM logic dynamically

---

## 📚 Credits

This extension was originally bootstrapped with  
[web-extension-boilerplate](https://github.com/davidnguyen11/web-extension-boilerplate),  
and has been fully customized for the IBM BAW ecosystem.

---

## 📝 License

MIT © edumelo