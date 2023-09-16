//on installation of Chrome extension: create contextMenuItem
chrome.runtime.onInstalled.addListener(() => {
    ['selection', 'image', 'link', 'page'].map(type =>
        chrome.contextMenus.create({
            id: `stt-send${type[0].toUpperCase() + type.slice(1)}`,
            title: `Send this ${type === 'selection' ? 'text' : type} to Telegram`,
            contexts: [type]
        })
    );
});

const getCurrentTab = async () => await chrome.tabs.query({active: true, currentWindow: true});

//add listener for click on self defined menu item
chrome.contextMenus.onClicked.addListener(async function(clickData){
    if (clickData.menuItemId === "stt-sendSelection" && clickData.selectionText) {
        const selectedContent = await getSelectedText();
        await sendMessage(selectedContent, 'text');
    }
    if (clickData.menuItemId === "stt-sendLink" && clickData.linkUrl) {
        console.log(clickData);
        await sendMessage(clickData.linkUrl, 'link');
    }
    if (clickData.menuItemId === "stt-sendPage") {
        console.log(clickData);
    }
    if (clickData.menuItemId === "stt-sendImage" && clickData.mediaType == 'image' && clickData.srcUrl) {
        const [currentTab] = await getCurrentTab();
        const selectedContent = {resource: clickData.srcUrl, tabURL: currentTab.url};
        await sendMessage(selectedContent, 'document');
    }
})

//to get a string which supports line breaks, use script execution on the page
const getSelectedText = async function () {
    const [currentTab] = await getCurrentTab();
    let result;
    try {
        [{result}] = await chrome.scripting.executeScript({
            target: {tabId: currentTab.id},
            function: () => getSelection().toString()
            // validating the string can be vital
            // calculate the length (consider the reply markups)
        });
    } catch (e) {
        console.log(e);
        return; // ignoring an unsupported page like chrome://extensions
    }
    //document.body.append('Selection: ' + result);
    return { text: result, tabURL: currentTab.url };
}

async function getAllStorageData(key) {
    return await chrome.storage.local.get();
}

//Function to check if given URL is valid
//Author @Pavlo https://stackoverflow.com/a/43467144
const isValidURL = function (string) {
    let url;
    try {
        url = new URL(string);
    } catch (_) {
        return false;
    }
    return url.protocol === "http:" || url.protocol === "https:";
}

// See if this scalable
const getMessageType = function(type) {
    switch (type) {
        case 'text':
        case 'link':
        case 'page':
            return '/sendMessage';
        case 'photo':
            return '/sendPhoto';
        case 'document':
            return '/sendDocument'
        case 'me':
            return '/getMe'
        default:
            return false;
    }
}

const buildRequestURL = function (type, options) {
    return 'https://api.telegram.org/bot' + options.apiKey + getMessageType(type);
}

const buildContentByType = function (type, content) {

    switch (type) {
        case 'text':
            return {typeSelector: 'text', contentSelector: content};
        case 'link':
            return {typeSelector: 'text', contentSelector: content};
        case 'page':
            return {typeSelector: 'text', contentSelector: content.pageUrl};
        case 'photo':
            return {typeSelector: 'document', contentSelector: content.srcUrl};
        default:
            return false;
    }

}

const buildPostData = function(type, content, options) {

    if (!['text', 'photo', 'document', 'link', 'page', 'me'].includes(type)) return;

    if (type === 'me') return {};

    const parameters = {
        chat_id: options.chatId,
        disable_notification: true,
        disable_web_page_preview: true
        // markdown + spoiler
    };

    const a = buildContentByType(type, content);
    console.log(a);
    parameters[a] = b;

    if (isValidURL(content.tabURL)) {
        parameters.reply_markup = {
            inline_keyboard: [
                [{ text: 'Source', url: content.tabURL }]
            ],
        }
    }

    return parameters;
}

const fetchAPI = async function(url, postData) {
    const options = {
        method: 'POST',
        headers: {
            "Content-Type": "application/json"
        },
        body: postData ? JSON.stringify(postData) : undefined
    };
    const responseData = await fetch(url, options);
    const jsonData = await responseData.json();
    return jsonData;
}

const sendMessage = async function (content, type) {

    const options = await getAllStorageData();
    const requestURL = buildRequestURL(type, options);
    const requestParameters = buildPostData(type, content, options);
    return await fetchAPI(requestURL, requestParameters);

}

// const getBotStatus = await fetchAPI(buildRequestURL('me', options), {});
// console.log(getBotStatus);
