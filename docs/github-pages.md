# Publish gradesign. at gratools.github.io/gradesign/

The application address is **https://gratools.github.io/gradesign/**. The repository address, `github.com/gratools/gradesign`, displays source files and this README; it is not the application.

## Upload the ready-built release

1. Extract `gradesign-github-ready.zip` on your computer.
2. Upload the extracted contents to the root of the **gratools/gradesign** repository on the `main` branch. Do not upload the ZIP itself or put everything inside an extra folder. Include hidden files, particularly `.nojekyll`.
3. Confirm the repository root contains `index.html`, `_next/`, `brand/`, `fonts/`, `elements/`, `templates/`, `background-removal/` and `.nojekyll`.
4. In **Settings → Pages → Build and deployment**, choose **Deploy from a branch**, then **main** and **/ (root)**. Save.
5. Wait for the Pages deployment to finish, then open **https://gratools.github.io/gradesign/**.

The built index opens the editor. `.nojekyll` ensures GitHub serves the `_next` application files. The release already uses `/gradesign` for all application and asset paths. GitHub's browser upload may require multiple batches; GitHub Desktop can commit the entire extracted folder at once.

## Rebuild after source changes

The ZIP also contains the editable source in `apps/web`, its dependencies list and lockfile, and the GitHub Actions workflow. To rebuild automatically, change **Settings → Pages → Source** to **GitHub Actions**, then run **Actions → Deploy gradesign to GitHub Pages → Run workflow**. Future pushes to `main` rebuild and publish the application. This mode deploys `dist/` generated from source rather than the prebuilt root files.

For a local build, use Node.js 24 and pnpm 11.25.0:

```sh
pnpm install --frozen-lockfile
pnpm build
```

The production build defaults to `/gradesign`. Publish the contents of `dist/`; for branch publishing, replace the built files at the repository root with these contents. Development with `pnpm dev` uses http://localhost:3000. Set `NEXT_PUBLIC_BASE_PATH` explicitly only when building for another site path.

## Your designs

Designs and uploads stay in each visitor's browser. They are not committed to GitHub. Work saved at a different website address does not transfer automatically: export editable project backups there and import them at the application address above.

The release excludes private hosting settings, Git history, credentials, dependencies and build caches. It includes source, the ready-built website, brand assets and third-party license notices.
