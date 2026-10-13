# Publish your own gradesign. site

You can use the gradesign. website without downloading this repository. These steps are for people who want to host their own copy.

1. Create a GitHub repository. Extract the ZIP and upload its contents to the repository root, including the hidden `.github` folder. The `package.json`, `apps` and `.github` entries should be at the top level.
2. Commit to `main`. If your default branch has another name, update `branches` in `.github/workflows/pages.yml`.
3. In **Settings → Pages**, select **GitHub Actions** as the build source.
4. Open **Actions → Deploy gradesign to GitHub Pages → Run workflow**. Later pushes to `main` deploy automatically.
5. Open the website URL shown by the completed deployment.

The workflow builds the editor and sets the correct asset paths for your repository or custom domain. All required app assets are included. No API keys are needed.

## Your designs

Projects and uploads are stored in each visitor's browser, not in the GitHub repository. Moving to a different site address does not transfer them. Download editable project backups from the old address and import them at the new address. Keep original image files for uploads you have not used in projects.

## Build manually

Use Node.js 24 and pnpm 11.25.0:

```sh
pnpm install --frozen-lockfile
pnpm build
```

Publish the contents of `dist/` to a static host. Set `NEXT_PUBLIC_BASE_PATH=/REPOSITORY` before building for a subdirectory, or leave it empty for a domain root. Serve over HTTP or HTTPS.

The source ZIP excludes dependencies, build output, private environment files and machine-specific hosting configuration. It includes all six gradesign. brand files and third-party license notices.
