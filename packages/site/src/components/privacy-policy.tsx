import { Article, ArticleSection } from '@/components/article';
import { links } from '@/lib/links';

export function Privacy() {
  return (
    <Article
      title="Privacy policy"
      lede="Send to Telegram keeps as little as it can. This page lists everything it stores, where it keeps it, and how to remove it."
      note="Last updated 1 November 2026"
    >
      <ArticleSection title="The short version">
        <ul>
          <li>
            There’s no account, no ads and no analytics, in the extension or on
            this site.
          </li>
          <li>Your chats, bot tokens and history stay in your browser.</li>
          <li>
            S2T Relay passes your messages on to Telegram and never stores or
            logs them.
          </li>
        </ul>
      </ArticleSection>

      <ArticleSection title="In your browser">
        <p>
          The extension keeps your chats, bot tokens, hashtags, settings and
          history in the browser’s extension storage on your device. They aren’t
          synced or sent anywhere else. Nothing you send from a private window
          is added to history.
        </p>
        <p>
          With the password lock on, all of it is encrypted. The key is held in
          memory only, until the browser closes.
        </p>
        <p>
          To delete it, remove a chat or clear your history in the extension’s
          settings, or uninstall the extension to remove everything.
        </p>
      </ArticleSection>

      <ArticleSection title="When you send">
        <p>
          With your own bot, the extension sends straight to Telegram’s Bot API
          at api.telegram.org, using your bot’s token. Nothing sits in between.
        </p>
        <p>
          With S2T Relay, it sends to relay.s2t.dev, which hands the message to
          Telegram. Once delivered, your messages are covered by{' '}
          <a href={links.telegramPrivacy}>Telegram’s privacy policy</a>.
        </p>
      </ArticleSection>

      <ArticleSection title="What S2T Relay stores">
        <p>For each browser linked to a chat, the relay keeps:</p>
        <ul>
          <li>
            A SHA-256 hash of the browser’s random token, never the token itself
          </li>
          <li>The browser’s name, such as “Chrome on macOS”</li>
          <li>The chat it sends to: its ID, title and type</li>
          <li>When it was linked and when it was last used</li>
          <li>
            While linking, a one-time code that expires. Links that are never
            finished are deleted every day.
          </li>
        </ul>
        <p>
          <strong>Your messages aren’t stored or logged.</strong> The relay
          passes them to Telegram and keeps nothing. Request logging is off, and
          errors are logged by type only.
        </p>
        <p>
          Your IP address is used only to limit how many requests one network
          can make in a minute. It isn’t written to the relay’s database.
        </p>
        <p>
          The relay runs on Cloudflare Workers, so Cloudflare handles its
          requests. Its code is <a href={links.relay}>open source</a>, and you
          can host your own.
        </p>
      </ArticleSection>

      <ArticleSection title="Removing a browser from the relay">
        <ul>
          <li>Remove the chat in the extension’s settings.</li>
          <li>
            Or send /devices to @S2TRelayBot in the chat and unlink the browser
            there.
          </li>
          <li>
            Removing or blocking the bot deletes every browser linked to that
            chat.
          </li>
        </ul>
      </ArticleSection>

      <ArticleSection title="Permissions">
        <ul>
          <li>
            <strong>Context menus</strong> adds Send to Telegram to the
            right-click menu.
          </li>
          <li>
            <strong>Storage</strong> keeps your chats, settings and history in
            the browser.
          </li>
          <li>
            <strong>Active tab and scripting</strong> read the page’s title,
            address and selected text, only in the tab you’re on and only when
            you open the popup or send.
          </li>
          <li>
            <strong>api.telegram.org</strong> is optional and asked for the
            first time you open a photo, video or file sent to your own bot. It
            lets the extension download it to show in the popup.
          </li>
        </ul>
      </ArticleSection>

      <ArticleSection title="This website">
        <p>
          s2t.dev sets no cookies and runs no analytics. It’s hosted on
          Cloudflare, which handles its requests like any web host.
        </p>
      </ArticleSection>

      <ArticleSection title="Changes and questions">
        <p>
          When this policy changes, the date at the top changes too, and the{' '}
          <a href={links.changelog}>changelog</a> says what changed. For
          questions, <a href={links.issues}>open an issue on GitHub</a>.
        </p>
      </ArticleSection>
    </Article>
  );
}
