import { defaultSettings } from "./options.js";

//on installation of Chrome extension: create contextMenuItem
chrome.runtime.onInstalled.addListener(async () => {
  //Create context menu items
    ['selection', 'image', 'link', 'page'].map(type =>
        chrome.contextMenus.create({
            id: `stt-send${type[0].toUpperCase() + type.slice(1)}`,
            title: `Send this ${type === 'selection' ? 'text' : type} to Telegram`,
            contexts: [type]
        })
    );
    //Set default settings if not set
    const options = await chrome.storage.local.get('options');
    if (Object.keys(options).length === 0) await chrome.storage.local.set({ options: defaultSettings });
    console.log('onInstalled');
});

const messageTypes = ['text', 'photo', 'document', 'link', 'page', 'me'];

const getCurrentTab = async () => await chrome.tabs.query({active: true, currentWindow: true});

//add listener for click on self defined menu item
chrome.contextMenus.onClicked.addListener(async function(clickData){
    if (clickData.menuItemId === "stt-sendSelection" && clickData.selectionText) {
        const selectedContent = await getSelectedText();
        await sendMessage(selectedContent, 'text');
    }
    if (clickData.menuItemId === "stt-sendLink" && clickData.linkUrl) {
        const [currentTab] = await getCurrentTab();
        const selectedContent = {linkUrl: clickData.linkUrl, tabUrl: currentTab.url};
        await sendMessage(selectedContent, 'link');
    }
    if (clickData.menuItemId === "stt-sendPage") {
        const [currentTab] = await getCurrentTab();
        const selectedContent = {pageUrl: currentTab.url, tabUrl: currentTab.url};
        await sendMessage(selectedContent, 'page');
    }
    if (clickData.menuItemId === "stt-sendImage" && clickData.mediaType === 'image' && clickData.srcUrl) {
        const [currentTab] = await getCurrentTab();
        const selectedContent = {srcUrl: clickData.srcUrl, tabUrl: currentTab.url};
        const options = await getStorageDataByKey('options');
        await sendMessage(selectedContent, options.actions.sendImage.sendAs);
    }
})

//to get a string which supports line breaks, use script execution on the page
const getSelectedText = async function () {
    const [currentTab] = await getCurrentTab();
    console.log(currentTab);
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
    return { text: result, tabUrl: currentTab.url };
}

async function getAllStorageData(key) {
    return await chrome.storage.local.get();
}

const getStorageDataByKey = async function(key) {
    const value = await chrome.storage.local.get([key]);
    return { ...value.options };
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
    return 'https://api.telegram.org/bot' + options.connections.setup[options.connections.use].key + getMessageType(type);
}

const buildContentByType = function (type, content) {

    switch (type) {
        case 'text':
            return {type: 'text', content: content.text};
        case 'link':
            return {type: 'text', content: content.linkUrl};
        case 'page':
            return {type: 'text', content: content.pageUrl};
        case 'photo':
            return {type: 'photo', content: content.srcUrl};
        case 'document':
            return {type: 'document', content: content.srcUrl};
        default:
            return false;
    }

}

const buildPostData = function(type, content, options) {

    if (!['text', 'photo', 'document', 'link', 'page', 'me'].includes(type)) return false;

    if (type === 'me') return {};

    const parameters = {
        chat_id: options.connections.setup[options.connections.use].chatId,
        disable_notification: true,
        disable_web_page_preview: true
        // markdown + spoiler
    };

    const userContent = buildContentByType(type, content);
    parameters[userContent['type']] = userContent['content'];

    if (isValidURL(content.tabUrl) && type !== 'page') {
        parameters.reply_markup = {
            inline_keyboard: [
                [{ text: 'Source', url: content.tabUrl }]
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
    return await fetch(url, options);
    // return await responseData.json();
}

const handleAPIResponse = async function (data) {
    await chrome.storage.local.set({'lastAPIResponse': data});
    if (data.ok) return true;
    else {
        throw({
            status: data['error_code'],
            description: data.description,
            stackTrace: new Error()
        });
    }
    // last failed message?
}

const registerLog = async function (content, response, type) {
    let {messageLogs: logs} = await chrome.storage.local.get('messageLogs');
    if (!logs) {
        await chrome.storage.local.set({'messageLogs': []})
        logs = [];
    }
    logs.push(buildLogObject(content, response, type));
    await chrome.storage.local.set({'messageLogs': logs});
}

const buildLogObject = function (content, response, type) {
    console.log(response);
    if (!response.ok) {
        return { type: type, content: content, timestamp: Date.now(), status: 'fail' };
    } else {
        const contentObject = ['photo', 'document'].includes(type) ? {
            ...content,
            fileID: response.result[type][0]['file_id'],
            uniqueID: response.result[type][0]['file_unique_id']
        } : content;
        return {type: type, content: contentObject, timestamp: Date.now(), status: 'success'};
    }
}

const handleBadgeText = async function (success) {
    if (typeof success !== "boolean") return false;

    await chrome.action.setBadgeText({ text: success ? 'Sent' : 'Fail' });
    await chrome.action.setBadgeBackgroundColor({ color: success ? '#008000bd' : '#880024' });

    if (success) {
        setTimeout(async () => {
            await chrome.action.setBadgeText({ text: '' })
        }, 1500);
    }
}

const sendMessage = async function (content, type) {
    try {
        if (typeof content === 'undefined' || !messageTypes.includes(type)) {
            throw new Error('sendMessage parameters are not valid!');
        }
        // Build the request parameters and message object
        const options = await getStorageDataByKey('options');
        const requestURL = buildRequestURL(type, options);
        const requestParameters = buildPostData(type, content, options);
        // Send the request to Telegram Bot API
        const sendRequest = await fetchAPI(requestURL, requestParameters);
        const response = await sendRequest.json();
        // Register the API response to the browser storage to use it later
        return await handleAPIResponse(response);
    } catch (error) {
        console.error('Error while sending the message: ', error);
    } finally {
        // Read the API response and then clear its value
        const { lastAPIResponse: apiResponse } = await chrome.storage.local.get('lastAPIResponse');
        await chrome.storage.local.set({'lastAPIResponse': ''});
        // Show status badge on the extension's icon and register the message log
        await handleBadgeText(apiResponse.ok);
        await registerLog(content, apiResponse, type);
    }
}

// const getBotStatus = await fetchAPI(buildRequestURL('me', options), {});
// console.log(getBotStatus);
