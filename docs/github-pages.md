# Publish gradesign. on GitHub Pages

The source package includes all six supplied brand assets, bundled fonts and licenses, the editor, optional backend source, and `.github/workflows/pages.yml`. The workflow builds and publishes only the static frontend. No API keys are needed for browser-local editing.

## Publish the source

1. Create a GitHub repository (for example, `gradesign`). Extract the source ZIP and put its contents at the repository root, including the hidden `.github` directory. `package.json`, `pnpm-lock.yaml`, `apps` and `.github` must be at the root, not inside another folder.
2. Commit the files to `main`. For another default branch, change `branches: [main]` in `.github/workflows/pages.yml`.
3. In **Settings → Pages → Build and deployment**, select **GitHub Actions** as the source.
4. Open **Actions → Deploy gradesign to GitHub Pages → Run workflow**. Future pushes to `main` deploy automatically. Approve the `github-pages` environment if your repository requires it.
5. Open the published URL shown by the deployment. A project repository uses `https://USERNAME.github.io/REPOSITORY/`; an account site named `USERNAME.github.io` uses the domain root.

The workflow obtains the correct base path from GitHub Pages. Bundles, logos, icons and fonts use that prefix automatically. Custom domains configured in GitHub Pages use the same workflow; rerun it after changing the domain.

## Build locally

Use Node.js 24 and pnpm 11.25.0:

```sh
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm install --frozen-lockfile
pnpm build
```

The generated `dist/` directory is the static website, including `.nojekyll`. For a repository subpath, set `NEXT_PUBLIC_BASE_PATH=/REPOSITORY` before building. Leave it empty for a domain-root site. Rebuild when changing the prefix. Serve the files over HTTP/HTTPS instead of opening `index.html` directly.

## Storage and deletion

Designs stay in the browser on the site where they were created; they are not committed to GitHub. Moving to a GitHub Pages address does not transfer designs: export editable projects from the previous site and import them in the new one.

Use **Projects → trash icon → Move to Trash** to delete a local design. **Projects → Trash → Restore** recovers it even after reloading. Deleting the open design opens another, or creates a new one if none remain. Trash retains embedded images/fonts and does not reclaim their space. Cloud copies are unaffected. Clearing browser site data removes both projects and Trash.

For accounts/shared storage, follow [backend.md](backend.md). The API, PostgreSQL and optional WebSocket service need separate hosting; GitHub Pages cannot run them.

## Package contents

The GitHub-ready ZIP excludes `.git`, machine-specific hosting identity (`.openai`), dependencies, build caches, private environment files and generated output. Keep the bundled font licenses and MIT license. User-provided brand assets are included unchanged; the software license does not grant additional trademark rights.

Reference: [GitHub's custom Pages workflow guide](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
