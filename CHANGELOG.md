# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - Unreleased

A rewrite from the ground up. Existing settings, chats, hashtags and history move over automatically on update.

### Added

- A popup that sends the current page or the selected text, with an optional note and hashtag. It's drawn like a Telegram chat, with earlier messages to that chat above, and previews the message as it will arrive; Enter sends. Search the chat and open settings from its header; failed messages have Send again right under them. Only connecting a new chat opens a page.
- More than one chat. Send to yourself, a group or a channel, and choose from the right-click menu.
- With your own bot, messages sent to it in a private chat or group show up in the popup's chat, so a link sent from your phone is a click away. Photos show in the chat and open full size, videos, GIFs and voice messages play in place, and files save with one click, up to Telegram's 20 MB limit for bots. The hosted bot doesn't do this, since its relay never keeps message content.
- The Send to Telegram bot: connect by pressing Start in Telegram instead of creating a bot. Optional, and backed by an open-source relay in `packages/relay`.
- Automatic chat detection when connecting your own bot, so finding a chat ID by hand is no longer needed.
- A searchable list of everything you sent on the settings page, with Send again, Copy and Remove, grouped by day.
- Keyboard shortcuts to open the popup and to send the current page.
- Dark mode, following the system or set by hand.
- An optional password lock. Chats, bot tokens, history and received messages are encrypted in the browser (AES-GCM, with a key wrapped by your password through PBKDF2), and asked for each time the browser starts or the extension updates, or also after 15 minutes or an hour without use if you choose. A recovery code shown once lets you set a new password if you forget it. Sends from the right-click menu while locked open the popup to unlock, then go out.
- Firefox support.

### Changed

- Selected text keeps its line breaks, and selections longer than one Telegram message arrive in several parts instead of failing.
- Images Telegram can't fetch as a photo fall back to a file, then to a link, so a send never silently disappears.
- The "Source" button is now "Open page", and isn't added when it would point at the content itself.
- Hashtags are limited to letters, numbers and underscores, the characters Telegram links.
- Failed sends show a red badge until the popup is opened, with the reason and how to fix it.
- A new icon: Telegram's paper plane on a floppy disk, in grays that hold up on light and dark toolbars.

### Removed

- The embed view and the step-by-step wizard, replaced by a single welcome page that starts with the quickest way to connect.

## [1.2.0] - 2024-09-21

### Added

- Added Hashtags feature to the extension. It allows users to attach hashtags to the messages, which helps categorizing them on Telegram.

## [1.1.0] - 2024-03-03

### Added

- Added an Embed View page which is automatically opened on the first install to help users get a better onboarding process. It can also be opened from the Embed View link on homepage afterwards.
- Added Wipe Data feature into the Embed View page.

## Fixed

- Fixed a width issue on Logs page.

## [1.0.2] - 2024-02-19

### Fixed

- Fixed CORS issue on homepage which occurs when there is no token saved yet. [~c29624f](https://github.com/ridvan/send-to-telegram/commit/c29624fa37889958fd0bd05ec20725cfae0a6ff7)

## [1.0.1] - 2024-02-17

### Fixed

- Fixed getting File ID from the API response for different image types. [~4fb838f](https://github.com/ridvan/send-to-telegram/commit/4fb838fe05d347ccce47610544b82eedd9fa345a)
- Fixed two override image type issues. [~8fe6fc3](https://github.com/ridvan/send-to-telegram/commit/8fe6fc30db6871fc5e2e670793fba9d9fc6b5c40)
    - If type is 'link', there will be no overrides.
    - Remote upload of .svg files is not supported by Telegram, so it sends the file link as a message for now.
- The extension will no longer log the messages in Incognito Mode even if the logging feature is enabled. [~32cb668](https://github.com/ridvan/send-to-telegram/commit/32cb668f60606e82d71ea95189ef3c01ddb2982d)

## 1.0.0 - 2024-02-12

Initial release of the Send to Telegram extension.

[1.2.0]: https://github.com/ridvan/send-to-telegram/releases/tag/v1.2.0
[1.1.0]: https://github.com/ridvan/send-to-telegram/releases/tag/v1.1.0
[1.0.2]: https://github.com/ridvan/send-to-telegram/releases/tag/v1.0.2
[1.0.1]: https://github.com/ridvan/send-to-telegram/releases/tag/v1.0.1
