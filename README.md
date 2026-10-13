# gradesign.

**A free personal design studio in your browser. Early access.**

Create presentations, social posts, posters and everyday designs. No installation, account or API key is needed.

## Start designing

1. Open [gradesign.](https://forma-open-design-studio.lukas-makela52.chatgpt.site/).
2. Choose **Blank canvas** or one of **93 editable templates** in Design.
3. Add text, shapes, icons, emoji or your own images. Drag elements to arrange them.
4. Use **Present** to show your pages or **Download** to export your work.

## What you can do

- Create multiple pages, duplicate them and change their order.
- Choose widescreen, vertical, standard or portrait page sizes. Resizing keeps element sizes unchanged by default; optional scaling fits artwork to the new page.
- Edit text, including selected words with different fonts, sizes, colors, bold and italic styles.
- Use bundled fonts or add your own WOFF2, WOFF, TTF or OTF files through **Brand**.
- Save brand colors for text, elements and page backgrounds.
- Add shapes, SVG icons, emoji and custom QR codes.
- Upload PNG, JPG, WebP and GIF images. Find them again in **Uploads**, click to reuse, or delete them from the library. Images already used in designs are kept.
- Use an image or color as a page background. Add image borders and rounded corners.
- Remove image backgrounds on your device, refine cutout solidity, or use adjustable chroma key. Cutout borders follow the subject's outline.
- Arrange, group, lock and hide layers. Undo and redo canvas edits.
- Add pinned notes to pages.
- Present with zoom and pen, line, box and circle annotations.
- Download PNG, JPG, SVG, PDF or an editable project file. PDF supports multiple pages.

## Keeping your work

Designs and uploads save in this browser on this device. The Projects panel shows your 12 most recent designs. Clearing the site's browser data removes local work, so keep backups of important projects.

Choose **Download → Download editable project** to save a backup. Use **Projects → Import** to open it later or move it to another browser. A project file includes images and custom fonts used in that project; unused uploads are separate from project backups.

Delete a project with its trash button in Projects. Restore it from **Projects → Trash**. Deleting an upload has an Undo button until you leave or reload the editor.

## Tips

Double-click text to edit it, then highlight words to format just those words. Use the corner handles to resize an element and the upper handle to rotate it. Ctrl/⌘ Z undoes a canvas edit; Ctrl/⌘ Shift Z redoes it.

Background removal works best with a clear subject. Increase **Subject solidity**, or use **Solidify existing cutout**, to reduce translucent patches. Use Undo before trying different removal settings. Completely erased details cannot be recovered with solidity. First use downloads about 16 MB of processing files.

This is an early-access release. Export a project backup before major changes. Presentation annotations are temporary, and canvas undo history resets when switching pages.

## Hosting your own copy

Most people can simply use the website. If you want your own copy, follow the short [GitHub Pages guide](docs/github-pages.md). The repository contains the static editor and its bundled assets.

For local development, install Node.js 24 and pnpm 11.25.0, then run:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open http://localhost:3000. Run `pnpm build` to create a static website in `dist/`, and `pnpm test` for the portable checks. [Font details](docs/fonts.md) cover supported files and font licenses.

## License

The application is [MIT licensed](LICENSE). Bundled fonts, icons, emoji data and background-removal components retain the license notices included with their files. The gradesign. brand assets are included in `apps/web/public/brand/`.
