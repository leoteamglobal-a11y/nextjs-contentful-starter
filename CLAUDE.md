# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start development server
npm run build      # Production build
npm run start      # Start production server
npm run import     # Import Contentful content models and sample data
```

No test runner is configured in this project.

## Architecture Overview

This is a **Next.js 15 App Router** project with **Contentful** as the headless CMS, deployable to **Netlify** with optional **Netlify Visual Editor** (Stackbit) support. It uses JavaScript (JSX), not TypeScript.

### Content Flow

1. Content is modeled and stored in Contentful (5 content types: `page`, `hero`, `button`, `stats`, `statItem`)
2. `src/utils/content.js` fetches content using the Contentful SDK — using the **preview API** in development (`NODE_ENV !== 'production'`) and the **delivery API** in production
3. Pages are dynamically composed: `page` entries hold an ordered array of section references (e.g., `hero`, `stats`), resolved recursively by `mapEntry()` up to depth 10
4. `src/app/[...slug]/page.jsx` maps each resolved section entry to its component using a hardcoded `componentMap`

### Contentful Utilities (`src/utils/content.js`)

- `getPageFromSlug(slug)` — fetches a page entry by slug, used by route components
- `getPagePaths()` — returns all page slugs for static path generation
- `mapEntry(entry)` / `parseField(value)` — recursive resolvers that turn Contentful link/asset references into plain objects with typed `fieldMapping`

### Component Conventions

- Components live in `src/components/`, named with PascalCase (e.g., `Hero.jsx`)
- All components use **named exports**: `export const Hero = (props) => {}`
- Props map directly to Contentful field names on the entry
- Every rendered element that corresponds to a Contentful entry or field includes Stackbit visual-editor metadata attributes:
  - `data-sb-object-id={props.id}` on the root element
  - `data-sb-field-path="fieldName"` on individual field elements
- Theme variants are string values passed from Contentful (e.g., `imgLeft`/`imgRight` for Hero, `primary`/`dark` for Stats)

### Styling

- **Tailwind CSS v4** via PostCSS plugin — no `tailwind.config.js`, uses v4 defaults
- Global styles imported in `styles/globals.css` with `@import 'tailwindcss'`
- No CSS modules; all styling is inline Tailwind utility classes
- Prettier: `printWidth: 120`, `singleQuote: true`, `trailingComma: all`

## Environment Variables

Copy `.env.example` to `.env.local` and populate:

| Variable | Purpose |
|---|---|
| `CONTENTFUL_SPACE_ID` | Identifies the Contentful workspace |
| `CONTENTFUL_DELIVERY_TOKEN` | Read published content (production) |
| `CONTENTFUL_PREVIEW_TOKEN` | Read draft content (development) |
| `CONTENTFUL_MANAGEMENT_TOKEN` | Write access, only needed for `npm run import` |

The `import` script (`contentful/import.js`) uses these to push the content model and sample entries from `contentful/export.json` into your Contentful space.

## Stackbit / Visual Editor

`stackbit.config.js` wires up the Netlify Visual Editor. It declares model mappings, the Contentful source, and a page URL pattern (`/{slug}`). The `data-sb-*` attributes in components are required for in-context editing to work. The `@stackbit/cms-contentful` and `@stackbit/types` packages support this integration.
