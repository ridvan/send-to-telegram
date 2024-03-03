import { defaultSettings } from '../../utils/constants.js';
import { getStorageData, setStorageData } from '../../utils/storage.js';
import { getIconPath } from '../../utils/getIconPath.js';

const selectById = (id) => document.getElementById(id);
const selectCheckedRadioByName = (name) => document.querySelector(`input[name="${name}"]:checked`);

const [toggleTokenVisibility, toggleChatIdVisibility] = [selectById('token-eye'), selectById('chat-id-eye')];
const [tokenInput, chatIdInput] = [selectById('tokenInput'), selectById('chatIdInput')];

const handleEyeSwitch = function (inputSelector) {
    this.classList.toggle('eyes-wide-shut');
    inputSelector.setAttribute('type', inputSelector.getAttribute('type') === 'password' ? 'text' : 'password');
};

toggleTokenVisibility.addEventListener('click', handleEyeSwitch.bind(toggleTokenVisibility, tokenInput));
toggleChatIdVisibility.addEventListener('click', handleEyeSwitch.bind(toggleChatIdVisibility, chatIdInput));

const messageTypeSelector = selectById('message-type-selector');
const textMessageOptionsContainer = selectById('text-message-options');
const imageMessageOptionsContainer = selectById('image-message-options');
const saveButtonSelector = selectById('save-all-settings');

const handleMessageSettingsChange = () => {

    const messageType = messageTypeSelector.value;

    if (messageType === 'text') {
        imageMessageOptionsContainer.style.display = 'none';
        textMessageOptionsContainer.style.display = 'block';
    }

    if (messageType === 'photo') {
        textMessageOptionsContainer.style.display = 'none';
        imageMessageOptionsContainer.style.display = 'block';
    }

    window.parent.postMessage('resize', '*');

};

messageTypeSelector.addEventListener('change', handleMessageSettingsChange);

const logSwitchSelector = selectById('logs-switch-checkbox');
const loggingOptionsSelector = selectById('logging-options');

const disableLoggingOptions = bool => [...document.getElementsByName('logging-type')].map(el => el.disabled = bool);

const toggleActivityLogStatus = () => {

    if (logSwitchSelector.checked) {
        loggingOptionsSelector.classList.remove('disabled-log-field');
        disableLoggingOptions(false);
    } else {
        loggingOptionsSelector.classList.add('disabled-log-field');
        disableLoggingOptions(true);
    }

};

document.addEventListener('DOMContentLoaded', toggleActivityLogStatus);
logSwitchSelector.addEventListener('change', toggleActivityLogStatus);

const getSelectedOptions = activeTab => {
    switch (activeTab) {
        case 1:
            return {
                connections: {
                    use: 0,
                    setup: {
                        0: {
                            name: 'Default',
                            key: selectById('tokenInput').value,
                            chatId: selectById('chatIdInput').value
                        }
                    }
                }
            };
        case 2:
            return {
                actions: {
                    sendMessage: {
                        disableNotificationSound: selectById('opt-text-silent-message').checked,
                        disablePreview: selectById('opt-text-disable-preview').checked,
                        addSourceLink: selectById('opt-text-add-source-link').checked
                    },
                    sendImage: {
                        disableNotificationSound: selectById('opt-image-silent-message').checked,
                        addSourceLink: selectById('opt-image-add-source-link').checked,
                        // useWeservProxy: selectById('opt-image-use-weserv-proxy').checked,
                        sendAs: selectCheckedRadioByName('image-message-type').value
                    }
                }
            };
        case 3:
            return {
                logs: {
                    active: selectById('logs-switch-checkbox').checked,
                    type: selectCheckedRadioByName('logging-type').value
                }
            };
        default:
            return false;
    }
};

const isValidToken = str => {
    const regex = /^\d{8,10}:[A-Za-z0-9_-]{35}$/;
    return regex.test(str);
};

const isValidChatId = str => {
    const regex = /^-?\d+$/;
    return regex.test(str);
};

const getActiveTabId = () => {
    return Number(document.querySelector('.legacy-tab-input:checked').dataset.targetId);
};

const getUserSettings = async () => {
    const options = await getStorageData('options');
    if (!options || Object.keys(options).length === 0) {
        await setStorageData('options', defaultSettings);
    }
    return await getStorageData('options');
};

const validateConnectionSettings = () => {
    if (!isValidToken(tokenInput.value)) {
        tokenInput.classList.add('invalid-input');
    }
    if (!isValidChatId(chatIdInput.value)) {
        chatIdInput.classList.add('invalid-input');
    }
    return !(!isValidToken(tokenInput.value) || !isValidChatId(chatIdInput.value));
};

const validateActionSettings = () => {
    const actions = getSelectedOptions(2)['actions'];
    for (const type in actions) {
        for (const option in actions[type]) {
            const value = actions[type][option];
            if (!(typeof value === 'boolean' || (typeof value === 'string' && ['photo', 'document', 'link'].includes(value)))) {
                return false;
            }
        }
    }
    return true;
};

const validateLogSettings = () => {
    const logs = getSelectedOptions(3)['logs'];
    for (const option in logs) {
        const value = logs[option];
        if (!(typeof value === 'boolean' || (typeof value === 'string' && ['everything', 'timestamp'].includes(value)))) {
            return false;
        }
    }
    return true;
};

const validateByTabId = (tabId) => {
    switch (tabId) {
        case 1:
            return validateConnectionSettings();
        case 2:
            return validateActionSettings();
        case 3:
            return validateLogSettings();
        default:
            return false;
    }
};

const saveSettings = async function (data) {
    const [type, settings] = Object.entries(data)[0];
    if (!['connections', 'actions', 'logs'].includes(type)) {
        return false;
    }
    const options = await getUserSettings();
    if (!validateByTabId(getActiveTabId())) {
        return false;
    }
    options[type] = settings;
    try {
        await setStorageData('options', options);
        return { success: true };
    } catch (err) {
        return { success: false, message: err };
    }
};

const updateSaveButton = function (content, disabled, reset) {
    if (typeof content === 'string') {
        saveButtonSelector.textContent = content;
    } else {
        while (saveButtonSelector.firstChild) {
            saveButtonSelector.removeChild(saveButtonSelector.firstChild);
        }
        saveButtonSelector.appendChild(content);
    }
    saveButtonSelector.disabled = disabled;

    if (reset) {
        setTimeout(() => {
            updateSaveButton('Save', false, false);
        }, reset);
    }
};

const showSaveOperationStatus = function (status) {
    const loaderSpan = document.createElement('span');
    loaderSpan.classList.add('loader', 'no-button-hover');
    updateSaveButton(loaderSpan, true, false);
    const iconUrl = getIconPath(status.success ? 'success-bold' : 'fail');
    setTimeout(() => {
        const img = document.createElement('img');
        img.src = iconUrl;
        img.classList.add('no-button-hover');
        img.height = 26;
        img.width = 26;
        img.role = 'status';
        img.alt = `Settings are${status.success ? '' : ' not'} saved`;
        updateSaveButton(img, true, 500);
    }, 500);
};

saveButtonSelector.addEventListener('click', async (event) => {
    event.preventDefault();
    showSaveOperationStatus(
        await saveSettings(getSelectedOptions(getActiveTabId()))
    );
});

const removeInvalidInputClass = function () {
    this.classList.contains('invalid-input') && this.classList.remove('invalid-input');
};

tokenInput.addEventListener('click', removeInvalidInputClass);
chatIdInput.addEventListener('click', removeInvalidInputClass);

const populateSettings = async function () {
    const { connections: { setup }, actions: { sendMessage, sendImage }, logs: { active, type } } = await getUserSettings();

    // Connections
    const [connection] = Object.values(setup);
    tokenInput.value = connection.key;
    chatIdInput.value = connection.chatId;

    selectById('opt-text-silent-message').checked = sendMessage.disableNotificationSound;
    selectById('opt-text-disable-preview').checked = sendMessage.disablePreview;
    selectById('opt-text-add-source-link').checked = sendMessage.addSourceLink;

    selectById('opt-image-silent-message').checked = sendImage.disableNotificationSound;
    selectById('opt-image-add-source-link').checked = sendImage.addSourceLink;
    // selectById('opt-image-use-weserv-proxy').checked = sendImage.useWeservProxy;
    selectById(`opt-image-send-as-${sendImage.sendAs}`).checked = true;

    // Logs
    selectById('logs-switch-checkbox').checked = active;
    selectById(`log-${type === 'everything' ? 'everything' : 'timestamp-only'}`).checked = true;
    toggleActivityLogStatus();
};

document.addEventListener('DOMContentLoaded', populateSettings);

const handleActiveTab = function () {
    const activeTabId = getActiveTabId();
    const otherTabIds = [...document.querySelectorAll('[data-target-id]')]
        .map(element => Number(element.dataset.targetId))
        .filter(id => id !== activeTabId);
    document.querySelector(`#settings-tab-content-${activeTabId}`).style.display = 'block';
    otherTabIds.forEach(tab => document.querySelector(`#settings-tab-content-${tab}`).style.display = 'none');
};

[...document.querySelectorAll('.settings-tab-label')].forEach(element => {
   element.addEventListener('click', function () {
       document.querySelector(`#settings-tab-selector-${this.dataset.btnId}`).checked = true;
       handleActiveTab();
       window.parent.postMessage('resize', '*');
   });
});
