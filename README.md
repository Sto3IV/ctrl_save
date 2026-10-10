# Quick Save Images

Maxthon's "Quick save images" for Vivaldi. Hold **Ctrl** and left-click an image, and it is saved straight into your folder, with no dialog.

## Install

1. Run `install.cmd`. It builds the helper with the C# compiler that ships with Windows and registers it for the current user.
2. In Vivaldi, open `vivaldi://extensions`.
3. Turn on **Developer mode**, click **Load unpacked**, and choose this folder.
4. To open the settings, click the extension's toolbar button.

## Settings

- **Quick Save images by clicking while holding the Ctrl key** turns the feature on or off.
- **Save path** is your Pictures folder by default. **Change** opens the Windows folder picker.
- **Repeated file name** decides what happens when the name is taken:
  - **Auto-change file name** saves `photo (1).jpg`, `photo (2).jpg`, and so on;
  - **Overwrite file** replaces the existing file.

## Behaviour

- **What gets saved.** Ctrl+left-click saves the image even when it is inside a link. The page sees none of the click, so lightboxes don't open either. Middle-click still opens links.
- **Confirmation.** A Windows notification confirms each save. Click it to see the file in Explorer.
- **File name.** It comes from the server or the image address. The extension is corrected from the image bytes, so `photo.php` becomes `photo.jpg` and a WebP served as `.jpg` becomes `.webp`.
- **Other sites.** An image hosted on another site is fetched with your cookies, and with the page's origin as Referer. Hotlink-protected images (pixiv) save too.
- **Images only.** Nothing but real images is written. An HTML error page is refused.
- **Tabs already open.** They work as soon as the extension is loaded or reloaded, with no page refresh.

## Limits

- **No `<img>` under the cursor.** The click passes through untouched. This happens when an image is covered by a transparent layer (Instagram), or when it is drawn as a CSS background.
- **Tabs open at install or reload time.** The image is saved, but the page itself may still notice the click until the tab is refreshed. A page script that listened for clicks before the extension arrived runs first; no extension can get ahead of it.
- **Pages without extensions.** Vivaldi's internal pages and the Chrome Web Store don't run extensions at all.

## Uninstall

Run `uninstall.cmd`, then remove the extension in `vivaldi://extensions`.

## Files

- `content.js` catches Ctrl+click in every page and frame, and reads same-origin images from the page's cache.
- `background.js` fetches images from other sites, names the file, calls the helper and shows notifications.
- `host\QuickSaveHost.cs` is the helper. It writes the file, shows the folder picker and reveals saved files in Explorer. `install.cmd` compiles it to `QuickSaveHost.exe`.

## License

This is free and unencumbered software released into the public domain under [The Unlicense](LICENSE).

