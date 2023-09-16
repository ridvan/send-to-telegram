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

const buildOptionsObject = () => {
    return {
        users: {
            activeUserId: 0,
            list: {
                0: {
                    token: selectById('tokenInput').value,
                    chatId: selectById('chatIdInput').value
                }
            }
        },
        messages: {
            text: {
                disableNotificationSound: selectById('opt-text-silent-message').checked,
                disablePreview: selectById('opt-text-disable-preview').checked,
                addSourceLink: selectById('opt-text-add-source-link').checked
            },
            image: {
                disableNotificationSound: selectById('opt-image-silent-message').checked,
                addSourceLink: selectById('opt-image-add-source-link').checked,
                sendAs: selectCheckedRadioByName('image-message-type').value
            }
        },
        logs: {
            status: selectById('logs-switch-checkbox').checked,
            storingType: selectCheckedRadioByName('logging-type').value
        }
    }
};

// console.log(buildOptionsObject());

const checkBotToken = function(str) {
    const regex = /^[a-zA-Z0-9:_]+$/;
    return regex.test(str);
}

const checkChatId = function(str) {
    const regex = /^[1-9]\d*$/;
    return regex.test(str);
}

const saveButtonSelector = selectById('save-all-settings');
saveButtonSelector.addEventListener('click', () => {

})
