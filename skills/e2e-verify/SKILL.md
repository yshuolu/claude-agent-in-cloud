---
name: e2e-verify
description: End-to-end verification of changes. Use after implementing API changes, server changes, or UI changes to verify correctness. Triggers on phrases like "verify changes", "e2e test", "test the UI", "check the API", "verify my changes".
allowed-tools: Bash, Read, Glob, Grep, Agent
---

# E2E Verification

Verify changes by choosing the right strategy based on what changed.

## Determine verification type

Inspect the recent changes (staged files, modified files, recent commits) to classify:

- **API / server-only changes** — route handlers, services, middleware, store logic, no UI files touched → use curl verification
- **UI changes** — any `.tsx`, `.css`, or frontend file touched → use Playwright verification
- **Both** — run both strategies

## Discover dev URLs

Do NOT assume any hardcoded URLs or ports. Read the project's dev configuration to determine:

- **Server/API URL** — check dev scripts in `package.json`, `.env` files, or server source for the dev port
- **Web UI URL** — check frontend dev server config (e.g., vite config, next config, `package.json` dev scripts) for the dev port


## Strategy A: API / server-only (curl)

1. Discover the server base URL from project config (see above).

2. Read the project's route definitions to identify available endpoints and their expected methods, request bodies, and response shapes.

3. Test each changed endpoint with `curl -s <url> | jq .`:
   - Use the correct HTTP method (GET, POST, PUT, DELETE)
   - Include required headers and request bodies
   - Test both success and error cases

4. Verify:
   - Response status codes are correct (200, 201, 202, 404, 409 etc.)
   - Response bodies match expected schema
   - Error cases return proper error messages
   - Side effects work as expected

## Strategy B: UI changes (Playwright)

### Prerequisites — Playwright MCP server

The Playwright MCP server is pre-installed in the Docker agent image (`@playwright/mcp` + system Chromium). It is configured in `.mcp.json` and enabled in the Claude config.

**For local development** (outside Docker), install and configure manually:

1. Install the Playwright MCP package globally:
   ```
   npm install -g @playwright/mcp
   ```

2. Add the MCP server to Claude Code settings (`~/.claude/settings.json`):
   ```json
   {
     "mcpServers": {
       "playwright": {
         "command": "npx",
         "args": ["@playwright/mcp"]
       }
     }
   }
   ```

3. Restart Claude Code to pick up the new MCP server.

Available Playwright MCP tools:
- `browser_navigate` — navigate to a URL
- `browser_screenshot` — capture the current page
- `browser_click` — click an element
- `browser_type` — type into an input
- `browser_snapshot` — get an accessibility snapshot of the page

### Running UI verification

1. Discover the web UI URL from project config (see "Discover project URLs" above).

2. Use Playwright MCP tools to navigate and interact:
   - Navigate to the discovered web UI URL
   - Take a screenshot to see the current state
   - Interact with UI elements (click buttons, fill inputs, switch tabs)
   - Take screenshots after each significant interaction

3. For each UI change, verify:
   - The element renders correctly
   - Interactions work (clicks, form submissions, navigation)
   - Loading states and error states display properly
   - Data flows end-to-end as expected

### Design quality review (mandatory for UI changes)

Take a full-page screenshot and evaluate as a world-class designer:

**Contrast and readability:**
- Text must have sufficient contrast against backgrounds (WCAG AA minimum: 4.5:1 for normal text, 3:1 for large text)
- Interactive elements must be clearly distinguishable from static content
- Disabled states must still be readable but visually distinct
- Borders and dividers must be visible but not overpowering

**Visual hierarchy:**
- Primary actions (buttons) must stand out clearly
- Information hierarchy must be clear (headings > body > metadata)
- Active/selected states must be immediately obvious
- Spacing must be consistent and create clear groupings

**Layout and alignment:**
- Elements must be properly aligned on a grid
- Spacing between elements must be consistent
- The layout must not have awkward gaps or cramped areas
- Responsive behavior must work at common viewport sizes

**Overall polish:**
- No orphaned or clipped text
- Consistent use of colors, fonts, and border radii
- Hover and focus states must exist for interactive elements
- Empty states must have helpful messaging

If any design issues are found, fix them before marking verification as complete. The bar is: would a senior designer at a top product company ship this?

## Reporting

After verification, summarize:
- What was tested
- What passed
- What failed and what was fixed
- Screenshots taken (if UI)
