import { setStorageData } from './../../utils/storage.js';
import { defaultSettings } from './../../utils/constants.js';

const getById = id => document.getElementById(id);

const updateFrameSize = iframe => {
    iframe.height = iframe.contentWindow.document.body.scrollHeight + 5;
    iframe.width = iframe.contentWindow.document.body.scrollWidth;
};

const [iframe, openWizard] = [getById('extension-view'), getById('open-wizard')];
const [wipeOpen, wipeConfirm, wipeCancel] = [getById('wipe-data'), getById('wipe-confirm'), getById('wipe-cancel')];

const toggleColumnVisibility = () => document.querySelectorAll('.column-item').forEach(item => { item.classList.toggle('hidden'); });

iframe.addEventListener('load', () => {
    updateFrameSize(iframe);
});

window.addEventListener('message', event => {
    if (event.data === 'resize') {
        updateFrameSize(iframe);
    }
});

openWizard.addEventListener('click', event => {
    event.preventDefault();
    iframe.src = '/pages/wizard.html';
    iframe.focus();
});

wipeOpen.addEventListener('click', event => {
    event.preventDefault();
    toggleColumnVisibility();
    document.querySelector('.wipe-menu span').focus();
});

wipeConfirm.addEventListener('click', async event => {
    event.preventDefault();

    const type = document.querySelector('input[name="wipe-option"]:checked').value;

    switch (type) {
        case 'all':
            await setStorageData('messageLogs', []);
            await setStorageData('totalMessageCount', 0);
            await setStorageData('options', defaultSettings);
            await chrome.action.setBadgeText({ text: '' });
            return iframe.src = '/pages/home.html';
        case 'logs':
            await setStorageData('messageLogs', []);
            await setStorageData('totalMessageCount', 0);
            await chrome.action.setBadgeText({ text: '' });
            return iframe.src = '/pages/logs.html';
        case 'settings':
            await setStorageData('options', defaultSettings);
            return iframe.src = '/pages/settings.html';
        default:
            throw new Error('Invalid wipe option');
    }
});

wipeCancel.addEventListener('click', event => {
    event.preventDefault();
    toggleColumnVisibility();
    document.querySelector('#open-wizard').focus();
});
