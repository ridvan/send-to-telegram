import { getStorageData } from '../../handlers/storage.js';
import { timestampToReadableDate } from '../../utils.js';

const removeExtensionBadge = async () => {
    await chrome.action.setBadgeText({ text: '' })
}

const highlightLogsButton = () => {
    const logsButton = document.querySelector('.logs.tooltip');
    const logsTooltipText = document.querySelector('.logs .tooltiptext');
    logsButton.style.backgroundColor = '#8b000024';
    logsTooltipText.style.visibility = 'visible';
    logsTooltipText.style.opacity = '1';
}

const handleMessageError = async () => {
    const badgeText = await chrome.action.getBadgeText({});
    if (badgeText !== 'Fail') return true;

    await removeExtensionBadge();
    highlightLogsButton();
}

const uppercaseFirstLetter = (str) => {
    return str[0].toUpperCase() + str.slice(1);
}

const getLastMessageByStatus = async status => {
    const logs = await getStorageData('messageLogs');
    const firstOfType = logs.find(log => log.status === status);
    if (firstOfType) {
        return `&bull; ${uppercaseFirstLetter(firstOfType.type)} at ${timestampToReadableDate(firstOfType.timestamp)}`;
    } else {
        return `&bull; none yet 👀`;
    }
}

const handleStatistics = async () => {
    const totalSent = await getStorageData('totalMessageCount');
    if (totalSent === 1) document.getElementById('message-word').innerText = 'message';
    document.getElementById('total-message-count').innerText = totalSent || 0;
    ['success', 'fail'].map(
        async status => document.getElementById(`last-${status}-message`).innerHTML = await getLastMessageByStatus(status)
    );
}

document.addEventListener('DOMContentLoaded', async () => {
    await handleStatistics();
    await handleMessageError();
});

const removeBlinkerAfterDelay = delay => {
    setTimeout(() => {
        [...document.querySelectorAll('.dot')].forEach((element, index) => {
            if (index !== 0) element.remove();
            element.classList.remove('blink-one');
        });
    }, delay);
};

const updateStatusAfterDelay = (status, delay) => {
    removeBlinkerAfterDelay(delay);
    setTimeout(() => {
        document.querySelector('.dot').classList.remove('gray-dot');
        document.querySelector('.dot').classList.add(status ? 'green-dot' : 'red-dot');
        document.getElementById('connection-message').innerText = `Connection${status ? '' : ' not'} established`;
    }, delay);
};

await chrome.runtime.sendMessage({
    message: "getConnectionStatus"
});

chrome.runtime.onMessage.addListener(function (request) {
    if (request.message === "returnConnectionStatus") {
        updateStatusAfterDelay(request?.data?.ok, 600);
    }
});
