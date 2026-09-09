# Emoji Explorer

[![Vercel demo](https://img.shields.io/badge/Demo-Vercel-000000?logo=vercel)](https://emoji-brain.vercel.app/)
[![Netlify demo](https://img.shields.io/badge/Demo-Netlify-00C7B7?logo=netlify&logoColor=white)](https://emoji-brain.netlify.app/)

Browse a hand-collected library of custom emoji and stickers, pick your favorites, and export them for Slack or the web. Emoji Explorer (`emoji-brain`) is a self-hostable, static Astro app with a React interface—no backend required.

## What you can do

- Search emoji metadata with Pagefind, with a local text-search fallback when Pagefind is unavailable.
- Adjust the grid size and filter the view to your selected emojis.
- Keep your selection between visits using localStorage.
- Copy a Slack browser upload script with the selected images embedded.
- Export filenames, HTML, CSS, or a Markdown table to the clipboard, or download the images as a ZIP.
- Switch between light and dark themes, with the initial theme following your system preference.

## Use the collection

1. Open the [Vercel demo](https://emoji-brain.vercel.app/) or [Netlify demo](https://emoji-brain.netlify.app/).
2. Search for emojis and click the ones you want to add to your sheet. Click again to remove one.
3. Choose **Copy Slack script**, or open **Other export options** beside it for the other formats.

For Slack, sign in to your workspace and open `https://YOUR-WORKSPACE.slack.com/customize/emoji`. Open your browser's developer tools, select **Console**, paste the generated script, and press **Enter**. Leave the page open to see progress and the final counts. Your workspace must allow you to add custom emoji.

Plain-text export copies filenames. HTML, CSS, and Markdown exports reference images on the site you exported from; ZIP includes the image files themselves.

## Run locally

Have Node.js and pnpm installed. Bun is also needed for the repository's TypeScript maintenance scripts and the combined `test:all` command.

```bash
git clone https://github.com/justsml/emoji-brain.git
cd emoji-brain
pnpm install
pnpm dev
```

Open `http://localhost:3000`. Set `PORT` to use another development port, for example `PORT=3001 pnpm dev`.

`pnpm preview` and `pnpm start` also honor `PORT`, defaulting to `4321`. For example, `PORT=3001 pnpm preview` serves the production build on port `3001`.

```bash
# Build the static site into dist/
pnpm build

# Preview the production build
pnpm preview
```

Deploy `dist/` to a static host such as Vercel or Netlify, using `pnpm build` as the build command.

## Collection and search data

Images live in [`public/emojis/`](public/emojis/), and the app reads [`src/data/emoji-metadata.json`](src/data/emoji-metadata.json). Each metadata entry includes an ID, filename, public path, tags, categories, creation date, and size in bytes.

When editing the collection, keep the images and metadata in sync, then regenerate the Pagefind index before building:

```bash
bun scripts/create-pagefind-index.ts
pnpm build
```

The [indexing script](scripts/create-pagefind-index.ts) writes to `public/pagefind/`. The normal build does not regenerate this index. Browsing the included collection does not require an AI API key.

## Tests

```bash
# Unit and component tests (Vitest)
pnpm test

# Watch unit tests
pnpm test:watch

# Install the browser used by the E2E suite (first run)
pnpm exec playwright install chromium

# E2E tests run against the production preview, so build first
pnpm build
pnpm test:e2e
```

Playwright starts the preview server at `http://localhost:4321`. See [`TESTING.md`](TESTING.md) for test locations and configuration.

## Project structure

| Path | Purpose |
| --- | --- |
| `src/pages/`, `src/layouts/` | Astro page and site shell |
| `src/components/` | React interface and component tests |
| `src/context/`, `src/hooks/` | Selection state and localStorage persistence |
| `src/lib/` | Export helpers and Slack script generation |
| `src/data/`, `src/types/` | Emoji metadata and TypeScript definitions |
| `src/styles/` | Global and component styles |
| `public/emojis/` | Emoji image files |
| `public/pagefind/` | Generated client-side search index |
| `scripts/` | Image conversion, metadata, indexing, and import utilities |
| `tests/` | Playwright scenarios and shared test setup |

Built with Astro, React, TypeScript, Tailwind CSS, shadcn/ui components, Pagefind, and JSZip. UI state uses React Context and a reducer.

## Ideas for later

- [ ] Discord import/export script generator
- [ ] Upload custom emojis through the app
- [ ] AI emoji remixer, possibly local
- [ ] Share selections through URL state
- [ ] Authentication and access controls

[Suggest an emoji or report an issue](https://github.com/justsml/emoji-brain/issues/new).
