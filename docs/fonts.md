# Fonts in gradesign.

The editor bundles twelve open-license font families: Inter, Roboto, Open Sans, Lato, Montserrat, Poppins, Lora, Playfair Display, Merriweather, Bebas Neue, Oswald and Space Mono. Their 43 Latin WOFF2 faces total about 936 KB. Each family has regular and bold weights and both normal and italic styles where the upstream family provides them. Bebas Neue only provides regular; Oswald provides regular and bold without italic. Browsers synthesize unsupported styles and intermediate weights. Arial, Georgia and Courier New remain system font choices, whose appearance depends on the viewer's device.

These are local files in `apps/web/public/fonts/`; production does not request Google Fonts, Fontsource's CDN or another third-party rendering service. Families are loaded on demand before Fabric measures text. The Latin files support the basic Western European repertoire (including Finnish characters); other scripts use the browser fallback unless the user imports an appropriate font.

## Custom fonts

Upload a WOFF2, WOFF, TTF or OTF file and give it a family name, a weight (normally 400 for regular or 700 for bold) and normal/italic style. To add a real bold or italic face, upload that file under the same family with its matching weight and style. The font menu lists each family once. A different family name is required when a bundled or system font already uses that name.

Custom fonts are stored as embedded data in project JSON so saved files, imported projects and shared designs carry their fonts. A project supports up to 20 custom faces, 3 MB per face and 12 MB of font bytes in total. WOFF2 is generally the smallest choice. Signature, container size, metadata and collection validation run on imported JSON; a fresh upload also passes the browser's full font parser before it is saved. Use font files you have permission to embed and distribute.

PNG/JPEG/PDF rendering waits for font loading. SVG export embeds the used bundled and custom font faces in `@font-face` declarations so those fonts travel with the SVG. Some SVG editing applications do not honor embedded fonts; raster exports preserve the exact rendered appearance. System font files are not redistributed. Text remains editable rather than being converted into paths.

## Developer integration

`apps/web/lib/fonts.ts` is the single source of the font list, validation and browser loading. Call `ensureFontsForCanvas(json, project.fonts)` before `loadFromJSON`, including in the public viewer. It inspects both object-level font families and per-character overrides inside nested groups. Call `ensureFontFamily(family, project.fonts)` before changing the selected text's family, then `CanvasHandle.refreshFonts()` when already-rendered text needs measurement refreshed. Newly loaded faces clear Fabric's font measurement cache. `registerCustomFonts()` retires custom faces from a previously opened project.

`importCustomFont()` returns a `CustomFont` but does not mutate project state. Append the result only after `validateCustomFontCollection()` accepts the complete collection. `embedFontsInSVG(svg, json, project.fonts)` returns an SVG with font data embedded. `ensureBundledFonts()` with no arguments can load all faces for a font-preview UI, but normal canvas loading only downloads the families used on that page.

Run font validation and portability checks with Node.js 24 or newer:

```sh
node --test scripts/fonts.test.mjs
```

## Sources and licenses

Font files were retrieved from the official [`@fontsource` packages](https://github.com/fontsource/font-files), version 5.3.0. Every included family is licensed under the SIL Open Font License 1.1. Each family folder includes the upstream `LICENSE` with its copyright notices. `public/fonts/sources.json` records the exact package version, archive URL, integrity value and copied filenames. The font licenses are separate from the application's MIT license.

The optional maintenance script downloads only the selected Latin faces and license, verifies each archive against the registry SHA-512 integrity value, and records provenance:

```powershell
./scripts/download-fonts.ps1 -Version 5.3.0
```

This maintenance step requires internet access. Normal installation, building and app font rendering use the checked-in files.
