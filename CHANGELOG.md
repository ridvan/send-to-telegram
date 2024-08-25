# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.1.0]: https://github.com/ridvan/send-to-telegram/releases/tag/v1.1.0
[1.0.1]: https://github.com/ridvan/send-to-telegram/releases/tag/v1.0.1
[1.0.2]: https://github.com/ridvan/send-to-telegram/releases/tag/v1.0.2
