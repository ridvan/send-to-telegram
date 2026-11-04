import { Article, ArticleSection } from '@/components/article';
import { links } from '@/lib/links';

export function Privacy() {
  return (
    <Article
      title="Privacy policy"
      lede="Send to Telegram keeps as little as it can. This page lists everything it stores, where it keeps it, and how to remove it."
      note="Last updated 4 November 2026"
    >
      <ArticleSection title="The short version">
        <ul>
          <li>
            There’s no account, no ads and no analytics, in the extension or on
            this site.
          </li>
          <li>Your chats, bot tokens and history stay in your browser.</li>
          <li>
            Messages go straight from your browser to Telegram, with nothing in
            between.
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
          The extension sends straight to Telegram’s Bot API at
          api.telegram.org, using your bot’s token. Nothing sits in between.
          Once delivered, your messages are covered by{' '}
          <a href={links.telegramPrivacy}>Telegram’s privacy policy</a>.
        </p>
      </ArticleSection>

      <ArticleSection title="S2T Relay">
        <p>
          S2T Relay, a way to connect a chat without your own bot, is coming
          soon. The extension doesn’t use it yet. Before it does, this page will
          list what the relay stores.
        </p>
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
