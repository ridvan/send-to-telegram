const repository = 'https://github.com/ridvan/send-to-telegram';

/** Where the site sends people. Firefox gets a link once it's listed. */
export const links = {
  chrome:
    'https://chromewebstore.google.com/detail/send-to-telegram/jejaagembgeeipilhpjpndednmcphenh',
  edge: 'https://microsoftedge.microsoft.com/addons/detail/send-to-telegram/gefemahopiogjhmaailegnjippcpfgbb',
  repository,
  relay: `${repository}/tree/main/packages/relay`,
  changelog: `${repository}/blob/main/CHANGELOG.md`,
  issues: `${repository}/issues`,
  botFather: 'https://t.me/BotFather',
  telegramPrivacy: 'https://telegram.org/privacy',
};
