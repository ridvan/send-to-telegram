const selectById = (id) => document.getElementById(id);
const selectCheckedRadioByName = (name) => document.querySelector(`input[name="${name}"]:checked`);

const [tokenEye, chatIdEye] = [selectById('token-eye'), selectById('chat-id-eye')];
const [tokenInput, chatIdInput] = [selectById('tokenInput'), selectById('chatIdInput')];

const handleEyeSwitch = function (inputSelector) {
    this.classList.toggle('eyes-wide-shut');
    inputSelector.setAttribute('type', inputSelector.getAttribute('type') === 'password' ? 'text' : 'password');
}

tokenEye.addEventListener('click', handleEyeSwitch.bind(tokenEye, tokenInput));
chatIdEye.addEventListener('click', handleEyeSwitch.bind(chatIdEye, chatIdInput));

// I guess the variable names are not so self-explanatory.

const messageTypeSelector = selectById('message-type-selector');
const textMessageOptionsContainer = selectById('text-message-options');
const imageMessageOptionsContainer = selectById('image-message-options');
const saveButtonSelector = selectById('save-all-settings');

const handleMessageSettingsChange = () => {

    const messageType = messageTypeSelector.value;

    if (messageType === 'text') {
        imageMessageOptionsContainer.style.display = "none";
        textMessageOptionsContainer.style.display = "block";
    }

    if (messageType === 'image') {
        textMessageOptionsContainer.style.display = "none";
        imageMessageOptionsContainer.style.display = "block";
    }

}

messageTypeSelector.addEventListener("change", handleMessageSettingsChange);

const logSwitchSelector = selectById('logs-switch-checkbox');
const loggingOptionsSelector = selectById('logging-options');

const disableLoggingOptions = bool => [...document.getElementsByName("logging-type")].map(el => el.disabled = bool);

const toggleActivityLogStatus = () => {

    if (logSwitchSelector.checked) {
        loggingOptionsSelector.classList.remove('disabled-log-field');
        disableLoggingOptions(false);
    } else {
        loggingOptionsSelector.classList.add('disabled-log-field');
        disableLoggingOptions(true);
    }

}

document.addEventListener("DOMContentLoaded", toggleActivityLogStatus);
logSwitchSelector.addEventListener("change", toggleActivityLogStatus);

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
            }
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
                        useWeservProxy: selectById('opt-image-use-weserv-proxy').checked,
                        sendAs: selectCheckedRadioByName('image-message-type').value
                    }
                }
            }
        case 3:
            return {
                logs: {
                    active: selectById('logs-switch-checkbox').checked,
                    type: selectCheckedRadioByName('logging-type').value
                }
            }
        default:
            return false;
    }
};

const isValidToken = str => {
    const regex = /^\d{8,10}:[A-Za-z0-9_-]{35}$/;
    return regex.test(str);
}

const isValidChatId = str => {
    const regex = /^-?\d+$/;
    return regex.test(str);
}

const getActiveTabId = () => {
    return Number(document.querySelector('.legacy-tab-input:checked').dataset.targetId);
}

const getSettings = async() => {
    return await chrome.storage.local.get('options');
}

const validateConnectionSettings = () => {
    if (!isValidToken(tokenInput.value)) {
        tokenInput.classList.add('invalid-input');
    }
    if (!isValidChatId(chatIdInput.value)) {
        chatIdInput.classList.add('invalid-input');
    }
    return !(!isValidToken(tokenInput.value) || !isValidChatId(chatIdInput.value));
}

const validateActionSettings = () => {
    const actions = getSelectedOptions(2)['actions'];
    for (const type in actions) {
        for (const option in actions[type]) {
            const value = actions[type][option];
            if (!(typeof value === 'boolean' || (typeof value === 'string' && ['image', 'document', 'link'].includes(value)))) {
                return false;
            }
        }
    }
    return true;
}

const validateLogSettings = () => {
    const logs = getSelectedOptions(3)['logs'];
    for (const option in logs) {
        const value = logs[option];
        if (!(typeof value === 'boolean' || (typeof value === 'string' && ['everything', 'timestamp'].includes(value)))) {
            return false;
        }
    }
    return true;
}

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
}

const saveSettings = async function(data) {
    [type, settings] = [Object.keys(data)[0], Object.values(data)[0]];
    if (!['connections', 'actions', 'logs'].includes(type)) return false;
    const { options } = await getSettings();
    if (!validateByTabId(getActiveTabId())) return false;
    options[type] = settings;
    try {
        await chrome.storage.local.set({ options });
        return { success: true };
    } catch (err) {
        return { success: false, message: err };
    }
}

const updateSaveButton = function(content, disabled, reset) {
    saveButtonSelector.innerHTML = content;
    saveButtonSelector.disabled = disabled;

    if (reset) {
        setTimeout(() => {
            updateSaveButton('Save', false, false);
        }, reset);
    }
}

const showSaveOperationStatus = function(status) {
    updateSaveButton('<span class="loader no-button-hover"></span>', true, false);
    const iconUrl = `../assets/icons/phospor-icons/${status.success ? 'check-bold' : 'x'}-ph.svg`;
    setTimeout(function () {
        updateSaveButton(`<img class="no-button-hover" src="${iconUrl}" height="26" width="26">`, true, 500);
    }, 500);
}

saveButtonSelector.addEventListener('click', async (event) => {
    event.preventDefault();
    showSaveOperationStatus(
        await saveSettings(getSelectedOptions(getActiveTabId()))
    )
    console.log(await getSettings());
});

const removeInvalidInputClass = function() {
    this.classList.contains('invalid-input') && this.classList.remove('invalid-input');
}

tokenInput.addEventListener('click', removeInvalidInputClass);
chatIdInput.addEventListener('click', removeInvalidInputClass);
