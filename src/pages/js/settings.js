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

const hashtagsSwitchSelector = selectById('tags-switch-checkbox');
const logSwitchSelector = selectById('logs-switch-checkbox');

const disableOptions = (parent, bool) => [...parent.querySelectorAll('[data-is-action-item="true"]')].map(el => el.disabled = bool);

const toggleSettingsAvailability = (selector, area) => {
    area.classList.toggle('disabled-action-items', !selector.checked);

    disableOptions(area, !selector.checked);
};

logSwitchSelector.addEventListener('change', () => toggleSettingsAvailability(logSwitchSelector, selectById('logging-options')));
hashtagsSwitchSelector.addEventListener('change', () => toggleSettingsAvailability(hashtagsSwitchSelector, selectById('tag-options')));

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
                hashtags: {
                    active: selectById('tags-switch-checkbox').checked,
                    use: 0,
                    setup: {
                        0: {
                            tags: [...document.querySelectorAll('.added-tag')].slice(0, 8).map(tag => tag.textContent)
                        }
                    }
                }
            };
        case 4:
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

const validateHashtagSettings = () => {
    const hashtags = getSelectedOptions(3)['hashtags'];
    if (hashtags.setup[hashtags.use].tags.length > 8) {
        return false;
    }
    return true;
};

const validateLogSettings = () => {
    const logs = getSelectedOptions(4)['logs'];
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
            return validateHashtagSettings();
        case 4:
            return validateLogSettings();
        default:
            return false;
    }
};

const saveSettings = async function (data) {
    const [type, settings] = Object.entries(data)[0];
    if (!['connections', 'actions', 'logs', 'hashtags'].includes(type)) {
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
    const { connections: { setup }, actions: { sendMessage, sendImage }, logs: { active, type }, hashtags: { active: hashtagsActive } } = await getUserSettings();

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

    // Hashtags
    selectById('tags-switch-checkbox').checked = hashtagsActive;

    // Logs
    selectById('logs-switch-checkbox').checked = active;
    selectById(`log-${type === 'everything' ? 'everything' : 'timestamp-only'}`).checked = true;

    toggleSettingsAvailability(hashtagsSwitchSelector, selectById('tag-options'));
    toggleSettingsAvailability(logSwitchSelector, selectById('logging-options'));
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

const updateTagOrder = () => {
    const items = document.querySelectorAll('#sortableList .grid-box');
    items.forEach((item, index) => {
        item.querySelector('.tag-order').textContent = (index + 1) + '.';
    });
    window.parent.postMessage('resize', '*');
};

const validateInput = () => {
    const input = document.getElementById('addTagInput').value;
    const alphanumericOnly = input.length > 0 && /^[a-zA-Z0-9]*$/.test(input);
    const atLeastTwoChars = input.length > 1;
    const upToThirtyChars = input.length > 0 && input.length <= 30;
    const currentTagCount = document.querySelectorAll('#sortableList .grid-box').length;
    const maxTagsNotReached = currentTagCount < 8;
    const isUnique = ![...document.querySelectorAll('.added-tag')].some(tag => tag.textContent.toLowerCase() === input);

    document.getElementById('alphanumeric-only').className = alphanumericOnly ? 'satisfies' : 'not-satisfies';
    document.getElementById('at-least-two-chars').className = atLeastTwoChars ? 'satisfies' : 'not-satisfies';
    document.getElementById('up-to-thirty-chars').className = upToThirtyChars ? 'satisfies' : 'not-satisfies';
    document.getElementById('max-tags-not-reached').className = maxTagsNotReached ? 'satisfies' : 'not-satisfies';
    document.getElementById('is-unique-tag').className = isUnique ? 'satisfies' : 'not-satisfies';

    const nonPrimaryRules = document.querySelectorAll('#tag-rules li:not(#max-tags-not-reached)');
    nonPrimaryRules.forEach(el => el.classList[maxTagsNotReached ? 'remove' : 'add']('hidden'));

    const isValid = alphanumericOnly && atLeastTwoChars && upToThirtyChars && maxTagsNotReached && isUnique;
    document.getElementById('btn-add-tag').className = isValid ? 'add-item-icon' : 'add-item-icon disabled';

    document.getElementById('tag-rules').className = input.length > 0 ? 'tag-rules-wrapper expanded' : 'tag-rules-wrapper hidden';

    if (input.length < 2) {
        const resizeInterval = setInterval(() => {
            window.parent.postMessage('resize', '*');
        }, 20);

        setTimeout(() => {
            clearInterval(resizeInterval);
        }, 200);
    }
};

const createAndAppendTag = (tag, index) => {
    const tagTemplate = document.getElementById('tag-template').content.cloneNode(true);
    tagTemplate.querySelector('.added-tag').textContent = tag;
    tagTemplate.querySelector('.added-tag').dataset.tagIndex = index + 1;
    tagTemplate.querySelector('.tag-order').textContent = `${index + 1}.`;
    document.getElementById('sortableList').appendChild(tagTemplate);
};

const createTagElements = async () => {
    const options = await getStorageData('options');
    if (!options.hashtags || Object.keys(options.hashtags).length === 0) {
        options.hashtags = defaultSettings.hashtags;
        await setStorageData('options', options);
    }

    const tags = options.hashtags.setup[options.hashtags.use].tags;
    tags.forEach((tag, index) => createAndAppendTag(tag, index));
};

const addTag = () => {
    const btnAddTag = document.getElementById('btn-add-tag');
    if (btnAddTag.classList.contains('disabled')) {
        return;
    }

    const input = document.getElementById('addTagInput');
    const newTag = input.value.trim();

    const sortableList = document.getElementById('sortableList');
    const newIndex = sortableList.children.length;

    createAndAppendTag(newTag, newIndex);
    input.value = '';

    updateTagOrder();
    validateInput();
};

document.addEventListener('DOMContentLoaded', async () => {

    await createTagElements();

    const addTagInput = document.getElementById('addTagInput');
    const btnAddTag = document.getElementById('btn-add-tag');

    addTagInput.addEventListener('input', validateInput);

    addTagInput.addEventListener('keypress', function(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            addTag();
        }
    });

    btnAddTag.addEventListener('click', addTag);

    window.sortable = new Sortable(document.getElementById('sortableList'), {
        forceFallback: true,
        animation: 150,
        ghostClass: 'grid-box-ghost',
        onEnd: () => {
            updateTagOrder();
        },
        onChoose: () => {
            document.body.classList.add('grabbing');
        },
        onUnchoose: () => {
            document.body.classList.remove('grabbing');
        }
    });
});
