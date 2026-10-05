# Days Until Plugin for Super Productivity

<img width="1433" height="528" alt="image" src="https://github.com/user-attachments/assets/e3fab114-3eeb-4b5c-b879-efa514cc9ff3" />


Standalone countdown board for Super Productivity.

## Included behavior

- Create synced countdown entries with title, date, and category
- Switch between active and archived countdowns
- Archive past countdowns or delete archived ones
- Manage groups from the More (⋯) menu and delete custom groups or removable default groups
- Confirm group deletion before permanently removing all its active and archived countdowns
- Keep Countdown and the reserved All/Alle group protected; deleted default groups stay removed after reloading
- Open the plugin from the side panel, menu entry, or header button

## Files

- `manifest.json`
- `plugin.js`
- `index.html`
- `icon.svg`

## Import

Zip `manifest.json`, `plugin.js`, `index.html`, and `icon.svg` flat and import the zip via the Super Productivity plugin UI.

## Tests

Run `npm install`, `npx playwright install chromium`, then `npm test`.
To use an existing Chrome installation instead, set `CHROME_PATH` to its executable path.
