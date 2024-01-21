***

<h3 align="center">
<sub>
<img src="./src/assets/logo/64.png" height="24" width="24">
</sub>
Send to Telegram
</h3>
<p align="center">
A browser extension to send selected contents on web pages to Telegram via Telegram Bot API.
</p>

***

Send to Telegram extension helps you send **texts, links, and images** on web pages easily to yourself or group chats using the context menu of the browser, as a Telegram message. It has an optional logging feature to save the messages that you have sent, similar to bookmarks.

<h1>Documentation</h1>

<h2>Installation</h2>

1. Create a Telegram Bot and obtain a Chat ID to start sending messages. You can follow the steps in the installation wizard to complete the setup process.
2. Don't forget to open the chat dialog with your bot and type **/start** so that it can access to the chat.
3. Go to the Settings page and save these credentials. Check out Message and Log settings as well, they are pretty straight-forward.
4. Start sending messages by simply right-clicking on the content and then clicking on the 'Send this to Telegram' option.

<h2>Features</h2>

<h3>Homepage</h3>

1. **Connection Status:** Checks if the Telegram Bot Token is correct and functional.
2. **Total Messages Sent:** Increments upon each successful message sent.
3. **Last Messages:** Time and content type of the last successful/failed messages.

<h3>Settings</h3>

<h4>User Settings</h4>

1. **Telegram Bot Token:** The token that you obtain by messaging [@BotFather](https://t.me/BotFather) on Telegram. The process of getting a token is super easy; don't be discouraged thinking it's necessary to be tech-savvy. Simply start chatting with the bot and you'll figure it out.
2. **Chat ID:** Your personal identifier on Telegram which is required for the Bot to be able to find and text you. You can use [@userinfobot](https://t.me/userinfobot). Simply start chatting with this bot and it will reply with your id. (It's safe, you can block the bot afterward if you want.)

<h4>Message Settings</h4>

1. **Disable Notification Sound:** The message notification of the bot is delivered silently to you.
2. **Disable Link Preview:** The OpenGraph title, description and image of the link won't be shown.
3. **Add Source Link:** The source link of the content will be added to the message as a button.
4. **Send as Photo:** The image will be shown on the chat directly. This option compresses the image upon sending it; however, it's not noticeable for regular content where you don't expect the image to be high quality.
5. **Send as Document:** The image will be sent without compression, and you will have to download it to see the image.
6. **Send as Link:** Images won't get uploaded to Telegram and only the image of the link will be sent.

<h4>Log Settings</h4>

1. **Store Timestamps Only**: Only the message date and content type will be saved, the message content won't be available to check out later.
2. **Store Everything**: You will be able to see the content you sent as well as its delivery date and content type.

<h3>Logs</h3>

- If the logging type is set to 'Everything' when a message is sent, you can expand or collapse the log container to view the message content by clicking on the 'Eye' icon.
- If the logging type is set to 'Timestamp-only' when a message is sent, you will only see the message date and content type.
- If logging is turned off when a message is sent, the message won't appear here.
- You can delete the log by clicking on the Trash icon.
- Disabling logging doesn't delete the previous logs.

<h2>Contributing</h2>

PRs are welcome! To contribute:

1. Fork the project.
2. Create your feature branch. (`git checkout -b username/feat/the-feature-name`)
3. Commit your changes. (`git commit -m 'feat(domain): info about the feature'`)
4. Push to the branch. (`git push origin username/feat/the-feature-name`)
5. Open a Pull Request.

<h3>Development</h3>

First, let's clone the project and install the dependencies.

```
git clone https://github.com/ridvan/send-to-telegram.git
cd send-to-telegram
npm install
```

Then, we need to add the '**src**' folder to the Chrome as an unpacked extension.

1. Go to the [**Extensions Page** on Chrome](chrome://extensions/).
2. Enable **Developer Mode** from the top-right side of the page.
3. Click on the **Load Unpacked** button.
4. Select the '**src**' folder under the '**send-to-telegram**' folder.

You need to **reload the extension** in the Extensions Page **to see your changes**. You can either click on the refresh icon in the Extensions page or use an unpacked Extension Reloader like [this one](https://chromewebstore.google.com/detail/fimgfedafeadlieiabdeeaodndnlbhid).
