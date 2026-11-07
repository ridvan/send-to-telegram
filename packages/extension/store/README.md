# Store listing images

One folder per store, each with a `dark/` and a `light/` set; use one set per listing. Each store's pictures name only its own browser.

| Store            | Folder     | Screenshots, 1280×800                                  | Small tile, 440×280                       | Marquee, 1400×560                      |
| ---------------- | ---------- | ------------------------------------------------------ | ----------------------------------------- | -------------------------------------- |
| Chrome Web Store | `chrome/`  | `screenshot-1.png` … `screenshot-5.png`, in this order | `small-tile.png` (small promo tile)       | `marquee.png` (marquee promo tile)     |
| Edge Add-ons     | `edge/`    | `screenshot-1.png` … `screenshot-5.png`, in this order | `small-tile.png` (small promotional tile) | `marquee.png` (large promotional tile) |
| Firefox Add-ons  | `firefox/` | `screenshot-1.png` … `screenshot-5.png`, in this order | Not used                                  | Not used                               |

They're drawn from the website's own parts at `packages/site/src/components/store-slides.tsx`. Each one is a page at `/store/<name>?theme=<dark|light>&browser=<chrome|edge|firefox>` on `pnpm dev:site`. To update one, capture its page with headless Chrome at a device scale of 2, scale it down with a Lanczos filter and a light unsharp mask (radius 0.6, 60%), and save it without alpha. Headless Chrome won't open a window narrower than about 500px, so the small tile draws at a fixed 440×280: capture it in a larger window and crop the top-left corner.

## Promo video

The 50-second video for the listings' promo video field is drawn from the same parts, frame by frame with Remotion, in `packages/site/video/`. Run `pnpm video` to open it in Remotion Studio, and `pnpm video:render` to write `packages/site/out/promo.mp4` (1920×1080, 30 fps, H.264, no sound; not committed). For the light version, run `pnpm --filter site exec remotion render promo out/promo-light.mp4 --props='{"theme":"light"}'`. The stores take the video as a YouTube link, so upload it there and paste the link.

The scenes live outside `src/` because their motion is set by the frame in inline styles, which the site's lint rules don't allow there. CSS animations and transitions are switched off in `video/video.css`, since each frame is drawn on its own and they would land in a different place on every one.
